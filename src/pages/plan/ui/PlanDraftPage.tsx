import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAssistantSession, useStartAutopilot } from '@/entities/assistant'
import { useContentPack } from '@/entities/content-pack'
import { contentFillValue, suggestedContentFill, type DeckPlan, type GenerationBrief, type GenerationCreate, type Job, type PlanProposal } from '@/entities/generation'
import { rememberRun } from '@/entities/project'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { DEFAULT_STRATEGY, STRATEGY_ORDER, strategyInfo, type CatalogStrategy } from '@/entities/variant'
import {
  applyServerPlanSet,
  isAbortError,
  PlanBuildProgress,
  readPlanRequest,
  requestAndStorePlan,
  syncPlanDraftToStorage,
  useBuildFromPlan,
  usePlanBuild,
  type StoredPlanRequest,
} from '@/features/edit-deck-plan'
import { requestOptionalJson } from '@/shared/api'
import { routes } from '@/shared/config'
import { EmptyState, PageHeader, Segmented, Skeleton } from '@/shared/ui'
import { EditablePlan } from './EditablePlan'
import styles from './PlanPage.module.css'
import { SourcesPanel } from './SourcesPanel'
import { SufficiencyPanel, type PlanAdjustment } from './SufficiencyPanel'

const EMPTY_HEADINGS: ReadonlyMap<string, string> = new Map()
const SLIDE_COUNT_MIN = 3
const SLIDE_COUNT_MAX = 40

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
  return error instanceof Error ? error.message : String(error)
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
  const contentFillFlag = useCapabilityFlag(FEATURE_PATHS.contentFill)
  const proposals = useMemo(() => stored?.result.proposals ?? [], [stored])
  const [selected, setSelected] = useState(() => defaultProposal(proposals))
  const { data: contentPack } = useContentPack(stored?.request.content_pack_id)
  const headings = useMemo<ReadonlyMap<string, string>>(
    () => (contentPack ? new Map(contentPack.sections.map((section) => [section.id, section.heading])) : EMPTY_HEADINGS),
    [contentPack],
  )

  const index = proposals.findIndex((proposal, position) => proposalKey(proposal, position) === selected)
  const proposal = proposals[index] ?? proposals[0]
  const draftKey = `draft:${projectId}:${proposal?.deckPlan.id ?? 'empty'}`
  const fallbackBuild = useBuildFromPlan(projectId, draftKey)

  const canAutoBuild = Boolean(!stored && sessionQuery.data?.artifacts.template_id && sessionQuery.data?.artifacts.content_pack_id)

  useEffect(() => {
    if (stored || rebuilding || autoBuildAttempted.current) return
    const session = sessionQuery.data
    const templateId = session?.artifacts.template_id
    const contentPackId = session?.artifacts.content_pack_id
    if (!templateId || !contentPackId) return
    autoBuildAttempted.current = true
    const brief = sessionBriefToGenerationBrief(session.brief)
    queueMicrotask(() => {
      const options = planBuild.begin()
      planBuild.enterPhase('plan')
      setRebuilding(true)
      setRebuildError(null)
      void requestAndStorePlan(
        projectId,
        {
          template_id: templateId,
          content_pack_id: contentPackId,
          brief,
          strategies: [DEFAULT_STRATEGY],
          use_llm: false,
        },
        { keyMessage: brief.key_message ?? null },
        options,
      )
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
      <div className={styles.page}>
        <PageHeader eyebrow="План" title="Строю план" />
        <PlanBuildProgress progress={planBuild.progress} phase={planBuild.phase} startedAt={planBuild.startedAt} onCancel={planBuild.cancel} />
      </div>
    )
  }

  if (!stored || !proposal) {
    if (sessionQuery.isLoading || (canAutoBuild && !rebuildError)) {
      return (
        <div className={styles.page}>
          <PageHeader eyebrow="План" title="План колоды" />
          <div className={styles.skeletons} aria-busy="true" aria-label="Загружаем план">
            {Array.from({ length: 5 }, (_, itemIndex) => (
              <Skeleton key={itemIndex} className={styles.skeletonRow} delay={itemIndex * 0.08} />
            ))}
          </div>
        </div>
      )
    }
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="План" title="План колоды" />
        <EmptyState
          title="Плана пока нет"
          description={rebuildError ?? 'Опишите тему на шаге «Бриф» и нажмите «Составить план».'}
          actions={
            <Link className={styles.secondaryLink} to={routes.brief(projectId)}>
              К брифу
            </Link>
          }
        />
      </div>
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
        fallbackBuild.build(buildBody(next), draftPlan, { lockAll: next.contentFill === 'keep' })
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
  const contentFill = stored.contentFill ?? suggestedContentFill(sufficiency?.status) ?? null
  const showFill = contentFillFlag || sufficiency !== null
  const variantCount = buildBody(stored).variants.length
  const showDirectBuild = Boolean(stored.variants && stored.variants.length > 1)
  const options = proposals.map((item, position) => ({
    value: proposalKey(item, position),
    label: item.strategy ? strategyInfo(item.strategy).name : `План ${position + 1}`,
  }))
  const sessionKeyMessage = typeof sessionQuery.data?.brief?.key_message === 'string' ? sessionQuery.data.brief.key_message : null

  return (
    <EditablePlan
      key={proposal.deckPlan.id}
      projectId={projectId}
      draftKey={draftKey}
      basePlan={proposal.deckPlan}
      headings={headings}
      eyebrow="План"
      description="Один план для всех вариантов: поправьте слайды, пункты и визуал — вёрстка сохранит ваш смысл."
      buildLabel={variantCount === 1 ? 'Сверстать вариант' : `Сверстать ${variantCount} варианта`}
      buildBody={buildBody(stored)}
      lockAll={stored.contentFill === 'keep'}
      sources={research?.sources}
      planId={planId}
      strategy={proposal.strategy}
      keyMessage={stored.keyMessage ?? sessionKeyMessage}
      assistantNote={autopilotNote ?? stored.assistantNote}
      onSelectStyle={handleSelectStyle}
      onAutopilot={(plan) => void handleAutopilot(plan)}
      autopilotPending={autopilot.isPending || fallbackBuild.isPending}
      showDirectBuild={showDirectBuild}
      onServerPlanSet={(planSet) => {
        setStored((current) => (current ? applyServerPlanSet(projectId, current, planSet) : current))
      }}
      onKeyMessageCommit={(_, nextPlan) => {
        setStored((current) => (current ? syncPlanDraftToStorage(projectId, current, nextPlan, proposal.strategy) : current))
      }}
      notice={rebuildError ? `Не удалось перестроить план: ${rebuildError}` : null}
      intro={
        showFill ? (
          <SufficiencyPanel
            sufficiency={sufficiency}
            contentFill={contentFill}
            targetSlides={stored.request.brief.target_slide_count}
            minSlides={SLIDE_COUNT_MIN}
            maxSlides={SLIDE_COUNT_MAX}
            disabled={rebuilding}
            onAdjust={(adjustment) => void rebuild(adjustment)}
          />
        ) : undefined
      }
      asideTop={
        research ? (
          <SourcesPanel research={research} disabled={rebuilding} onRemove={(sourceId) => void rebuild({}, [...excludedSources(stored), sourceId])} />
        ) : undefined
      }
      toolbar={
        options.length > 1 ? (
          <details className={styles.advanced}>
            <summary>Дополнительно: план другой стратегии</summary>
            <Segmented label="План какой стратегии править" options={options} value={proposalKey(proposal, Math.max(0, index))} onChange={setSelected} />
          </details>
        ) : undefined
      }
    />
  )
}
