import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { isAbortError, PlanBuildProgress, readPlanRequest, requestAndStorePlan, usePlanBuild, type StoredPlanRequest } from '@/features/edit-deck-plan'
import { useContentPack } from '@/entities/content-pack'
import { contentFillValue, suggestedContentFill, type GenerationCreate, type PlanProposal } from '@/entities/generation'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { DEFAULT_STRATEGY, STRATEGY_ORDER, strategyInfo, type CatalogStrategy } from '@/entities/variant'
import { routes } from '@/shared/config'
import { EmptyState, PageHeader, Segmented } from '@/shared/ui'
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

export function PlanDraftPage() {
  const { projectId = '' } = useParams()
  const [stored, setStored] = useState(() => readPlanRequest(projectId))
  const [rebuildError, setRebuildError] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const planBuild = usePlanBuild()
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

  if (!stored || !proposal) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Шаг 3 · План" title="План колоды" />
        <EmptyState
          title="Плана пока нет"
          description="Опишите тему на шаге «Бриф» и нажмите «Составить план»."
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

  if (rebuilding) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Шаг 3 · План" title="Перестраиваю план" />
        <PlanBuildProgress progress={planBuild.progress} phase={planBuild.phase} startedAt={planBuild.startedAt} onCancel={planBuild.cancel} />
      </div>
    )
  }

  const { sufficiency, research } = stored.result
  const contentFill = stored.contentFill ?? suggestedContentFill(sufficiency?.status) ?? null
  const showFill = contentFillFlag || sufficiency !== null
  const variantCount = buildBody(stored).variants.length
  const options = proposals.map((item, position) => ({
    value: proposalKey(item, position),
    label: item.strategy ? strategyInfo(item.strategy).name : `План ${position + 1}`,
  }))

  return (
    <EditablePlan
      key={proposal.deckPlan.id}
      projectId={projectId}
      draftKey={`draft:${projectId}:${proposal.deckPlan.id}`}
      basePlan={proposal.deckPlan}
      headings={headings}
      eyebrow="Шаг 3 · План"
      description="Один план для всех вариантов: поправьте слайды, пункты и визуал — вёрстка сохранит ваш смысл."
      buildLabel={variantCount === 1 ? 'Сверстать вариант' : `Сверстать ${variantCount} варианта`}
      buildBody={buildBody(stored)}
      lockAll={stored.contentFill === 'keep'}
      sources={research?.sources}
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
