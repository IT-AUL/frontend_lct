import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAssistantSession, useStartAutopilot } from '@/entities/assistant'
import { contentFillValue, type DeckPlan, type GenerationBrief, type GenerationCreate, type Job, type PlanProposal } from '@/entities/generation'
import { rememberRun } from '@/entities/project'
import { DEFAULT_STRATEGY, STRATEGY_ORDER, type CatalogStrategy } from '@/entities/variant'
import {
  applyServerPlanSet,
  fetchAndStorePlan,
  isAbortError,
  PlanBuildProgress,
  readPlanRequest,
  requestAndStorePlan,
  syncPlanDraftToStorage,
  useBuildFromPlan,
  usePlanBuild,
  type StoredPlanRequest,
} from '@/features/edit-deck-plan'
import { requestOptionalJson, humanError } from '@/shared/api'
import { routes } from '@/shared/config'
import { Button, Skeleton } from '@/shared/ui'
import { StepShell } from '@/widgets/step-shell'
import { PlanExtras, type PlanAdjustment } from './PlanExtras'
import { PlanStep } from './PlanStep'


function catalogStrategies(strategies: readonly string[]): CatalogStrategy[] {
  const known = STRATEGY_ORDER.filter((strategy) => strategies.includes(strategy))
  return known.length > 0 ? known : [...STRATEGY_ORDER]
}

function buildBody({ request, variants }: StoredPlanRequest): Omit<GenerationCreate, 'deck_plan' | 'deck_plan_id'> {
  const { strategies, ...body } = request
  return { ...body, variants: variants && variants.length > 0 ? variants : catalogStrategies(strategies ?? []).map((strategy) => ({ strategy })) }
}

function proposalKey(proposal: PlanProposal, index: number): string {
  return proposal.strategy ?? `plan-${index}`
}

function defaultProposal(proposals: readonly PlanProposal[]): string {
  const preferred = proposals.findIndex((proposal) => proposal.strategy === DEFAULT_STRATEGY)
  const index = preferred >= 0 ? preferred : 0
  const proposal = proposals[index]
  return proposal ? proposalKey(proposal, index) : ''
}

function errorText(error: unknown): string | null {
  if (!error || isAbortError(error)) return null
  return humanError(error, 'Не получилось составить план. Проверьте материалы и попробуйте ещё раз.')
}

function adjustedRequest(stored: StoredPlanRequest, adjustment: PlanAdjustment, excluded: readonly string[]): StoredPlanRequest['request'] {
  const { brief } = stored.request
  const contentFill = adjustment.contentFill ?? stored.contentFill ?? null
  const nextBrief = {
    ...brief,
    target_slide_count: adjustment.slideCount ?? brief.target_slide_count,
    ...(contentFill ? { content_fill: contentFillValue(contentFill) } : {}),
  }
  return { ...stored.request, brief: nextBrief, ...(excluded.length > 0 ? { exclude_source_ids: [...excluded] } : {}) }
}

function excludedSources(stored: StoredPlanRequest): string[] {
  const value = (stored.request as { exclude_source_ids?: unknown }).exclude_source_ids
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function sessionBriefToGenerationBrief(raw: Record<string, unknown>): GenerationBrief {
  return {
    purpose: typeof raw.purpose === 'string' && raw.purpose.trim() ? raw.purpose : 'Презентация',
    audience: typeof raw.audience === 'string' ? raw.audience : '',
    language: typeof raw.language === 'string' && raw.language ? raw.language : 'ru',
    target_slide_count: typeof raw.target_slide_count === 'number' && Number.isFinite(raw.target_slide_count) ? raw.target_slide_count : 8,
    ...(typeof raw.tone === 'string' ? { tone: raw.tone } : {}),
    ...(typeof raw.content_fill === 'string' ? { content_fill: raw.content_fill as GenerationBrief['content_fill'] } : {}),
    ...(typeof raw.key_message === 'string' ? { key_message: raw.key_message } : {}),
    ...(typeof raw.call_to_action === 'string' ? { call_to_action: raw.call_to_action } : {}),
  }
}

const CANONICAL_BRIEF_FIELDS = ['purpose', 'audience', 'language', 'key_message', 'call_to_action'] as const

function withCanonicalBrief(plan: DeckPlan, sessionBrief: Record<string, unknown> | undefined): DeckPlan {
  const brief = { ...plan.brief }
  for (const field of CANONICAL_BRIEF_FIELDS) {
    const value = sessionBrief?.[field]
    if (typeof value === 'string' && value.trim()) Object.assign(brief, { [field]: value.trim() })
  }
  return { ...plan, brief }
}

export function PlanDraftPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [stored, setStored] = useState(() => readPlanRequest(projectId))
  const [rebuildError, setRebuildError] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [autopilotNote, setAutopilotNote] = useState<string | null>(null)
  const autoBuildAttempted = useRef(false)
  const planBuild = usePlanBuild()
  const sessionQuery = useAssistantSession(projectId)
  const autopilot = useStartAutopilot(projectId)
  const proposals = useMemo(() => stored?.result.proposals ?? [], [stored])
  const [selected, setSelected] = useState(() => defaultProposal(proposals))

  const index = proposals.findIndex((proposal, position) => proposalKey(proposal, position) === selected)
  const proposal = proposals[index] ?? proposals[0]
  const draftKey = `draft:${projectId}:${proposal?.deckPlan.id ?? 'empty'}`
  const fallbackBuild = useBuildFromPlan(projectId, draftKey)

  const sessionPlanId = sessionQuery.data?.artifacts.plan_id ?? null
  const canAutoBuild = Boolean(!stored && (sessionPlanId || (sessionQuery.data?.artifacts.template_id && sessionQuery.data?.artifacts.content_pack_id)))

  useEffect(() => {
    if (stored || rebuilding || autoBuildAttempted.current) return
    const session = sessionQuery.data
    const templateId = session?.artifacts.template_id
    const contentPackId = session?.artifacts.content_pack_id
    const existingPlanId = session?.artifacts.plan_id ?? null
    if (!existingPlanId && (!templateId || !contentPackId)) return
    autoBuildAttempted.current = true
    const brief = sessionBriefToGenerationBrief(session?.brief ?? {})
    const fallbackRequest = {
      template_id: templateId ?? '',
      content_pack_id: contentPackId ?? '',
      brief,
      strategies: [DEFAULT_STRATEGY],
      use_llm: false,
    }
    queueMicrotask(() => {
      const options = planBuild.begin()
      planBuild.enterPhase('plan')
      setRebuilding(true)
      setRebuildError(null)
      const loadPlan = async () => {
        if (existingPlanId) {
          const fetched = await fetchAndStorePlan(
            projectId,
            existingPlanId,
            fallbackRequest,
            { keyMessage: brief.key_message ?? null },
            { signal: options.signal },
          )
          if (fetched) return fetched
        }
        if (!templateId || !contentPackId) {
          throw new Error('План не найден')
        }
        return requestAndStorePlan(
          projectId,
          {
            ...fallbackRequest,
            template_id: templateId,
            content_pack_id: contentPackId,
          },
          { keyMessage: brief.key_message ?? null },
          options,
        )
      }
      void loadPlan()
        .then((next) => {
          setStored(next)
          setSelected(defaultProposal(next.result.proposals))
        })
        .catch((error) => {
          setRebuildError(errorText(error))
        })
        .finally(() => {
          planBuild.finish()
          setRebuilding(false)
        })
    })
  }, [stored, rebuilding, sessionQuery.data, projectId, planBuild])

  if (rebuilding) {
    return (
      <StepShell title="Составляю план" note="Собираю структуру из ваших материалов…" canvasLabel="План презентации" canvas={<Skeleton style={{ height: 320, borderRadius: 6 }} />}>
        <PlanBuildProgress progress={planBuild.progress} phase={planBuild.phase} startedAt={planBuild.startedAt} onCancel={planBuild.cancel} />
      </StepShell>
    )
  }

  if (!stored || !proposal) {
    const waiting = sessionQuery.isLoading || (canAutoBuild && !rebuildError)
    return (
      <StepShell
        title="План презентации"
        note={waiting ? 'Загружаю план…' : (rebuildError ?? 'Плана пока нет. Вернитесь к материалам и нажмите «Дальше».')}
        canvasLabel="План презентации"
        canvas={waiting ? <Skeleton style={{ height: 320, borderRadius: 6 }} /> : null}
        actions={
          waiting ? undefined : (
            <Button variant="primary" size="lg" onClick={() => navigate(routes.start(projectId))}>
              К материалам
            </Button>
          )
        }
      />
    )
  }

  const rebuild = async (adjustment: PlanAdjustment, excluded = excludedSources(stored)) => {
    const options = planBuild.begin()
    planBuild.enterPhase('plan')
    setRebuilding(true)
    setRebuildError(null)
    try {
      const contentFill = adjustment.contentFill ?? stored.contentFill ?? null
      const next = await requestAndStorePlan(projectId, adjustedRequest(stored, adjustment, excluded), { variants: stored.variants, contentFill }, options)
      setStored(next)
      setSelected(defaultProposal(next.result.proposals))
    } catch (error) {
      setRebuildError(errorText(error))
    } finally {
      planBuild.finish()
      setRebuilding(false)
    }
  }

  const handleSelectStyle = (draftPlan: DeckPlan) => {
    const next = syncPlanDraftToStorage(projectId, stored, draftPlan, proposal.strategy)
    setStored(next)
    navigate(routes.style(projectId))
  }

  const handleAutopilot = async (draftPlan: DeckPlan) => {
    const next = syncPlanDraftToStorage(projectId, stored, draftPlan, proposal.strategy)
    setStored(next)
    setRebuildError(null)
    try {
      const accepted = await autopilot.mutateAsync({
        from_step: 4,
        use_llm: Boolean(next.request.use_llm),
        ...(next.request.provider_session_id ? { provider_session_id: next.request.provider_session_id } : {}),
      })
      if (!accepted) {
        fallbackBuild.build(buildBody(next), withCanonicalBrief(draftPlan, sessionQuery.data?.brief), { lockAll: next.contentFill === 'keep' })
        return
      }
      if (accepted.assistant_note) setAutopilotNote(accepted.assistant_note)
      const job = await requestOptionalJson<Job>(`/jobs/${encodeURIComponent(accepted.job_id)}`)
      const resultIds = job?.result_ids && typeof job.result_ids === 'object' ? (job.result_ids as Record<string, unknown>) : null
      const generationId = typeof resultIds?.generation_id === 'string' && resultIds.generation_id ? resultIds.generation_id : null
      const targetRunId = generationId ?? accepted.job_id
      if (generationId) rememberRun(projectId, generationId)
      navigate(routes.run(projectId, targetRunId))
    } catch (error) {
      setRebuildError(errorText(error))
    }
  }

  const { sufficiency, research, planId } = stored.result
  const sessionKeyMessage = typeof sessionQuery.data?.brief?.key_message === 'string' ? sessionQuery.data.brief.key_message : null

  return (
    <PlanStep
      key={proposal.deckPlan.id}
      draftKey={draftKey}
      basePlan={proposal.deckPlan}
      buildBody={buildBody(stored)}
      planId={planId}
      strategy={proposal.strategy}
      keyMessage={stored.keyMessage ?? sessionKeyMessage}
      assistantNote={autopilotNote ?? stored.assistantNote ?? null}
      notice={rebuildError ? `Не удалось перестроить план: ${rebuildError}` : null}
      onSelectStyle={handleSelectStyle}
      onAutopilot={(plan) => void handleAutopilot(plan)}
      autopilotPending={autopilot.isPending || fallbackBuild.isPending}
      onServerPlanSet={(planSet, optimisticPlan) => {
        setStored((current) => {
          if (!current) return current
          const applied = applyServerPlanSet(projectId, current, planSet)
          return optimisticPlan ? syncPlanDraftToStorage(projectId, applied, optimisticPlan, proposal.strategy) : applied
        })
      }}
      onKeyMessageCommit={(_, nextPlan) => {
        setStored((current) => (current ? syncPlanDraftToStorage(projectId, current, nextPlan, proposal.strategy) : current))
      }}
      extra={
        <PlanExtras
          sufficiency={sufficiency}
          sources={research?.sources ?? []}
          targetSlides={stored.request.brief.target_slide_count}
          disabled={rebuilding}
          onAdjust={(adjustment) => void rebuild(adjustment)}
          onRemoveSource={(sourceId) => void rebuild({}, [...excludedSources(stored), sourceId])}
        />
      }
    />
  )
}
