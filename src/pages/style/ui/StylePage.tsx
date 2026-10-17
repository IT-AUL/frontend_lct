import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  assistantKeys,
  useAssistantSession,
  useJobEvents,
  useStartAutopilot,
  useStartStylePreviews,
  useStylePreview,
  type PlanSet,
} from '@/entities/assistant'
import { startGeneration, whenGenerationAccepted, type DeckPlan } from '@/entities/generation'
import { rememberRun, useProject } from '@/entities/project'
import { DEFAULT_STRATEGY, STRATEGY_ORDER, type CatalogStrategy } from '@/entities/variant'
import { clearPlanDraft, readPlanRequest, requestAndStorePlan, type StoredPlanRequest } from '@/features/edit-deck-plan'
import { routes } from '@/shared/config'
import { formatIndex } from '@/shared/lib/format'
import { readJson } from '@/shared/lib/storage'
import { ArrowRight, Badge, Button, Check, EmptyState, Icon, Mono, PageHeader, Search, Sparkles } from '@/shared/ui'
import {
  buildGenerationPayload,
  buildStyleColumns,
  resolveRecommendedStrategy,
  resolveStyleAssistantNote,
} from '../model/styleView'
import { StyleCompareDialog } from './StyleCompareDialog'
import styles from './StylePage.module.css'

const DRAFT_STORAGE_PREFIX = 'deckdna.plan-draft.v1:'

function readEditedPlan(projectId: string, basePlan: DeckPlan | null): { plan: DeckPlan | null; draftKey: string | null } {
  if (!basePlan) return { plan: null, draftKey: null }
  const draftKey = `draft:${projectId}:${basePlan.id}`
  const stored = readJson<{ baseId?: string; plan?: DeckPlan } | null>(`${DRAFT_STORAGE_PREFIX}${draftKey}`, null)
  if (stored && stored.baseId === basePlan.id && Array.isArray(stored.plan?.slides)) {
    return { plan: stored.plan, draftKey }
  }
  return { plan: basePlan, draftKey }
}

function selectProposalPlan(stored: StoredPlanRequest | null, cachedPlanSet: PlanSet | undefined): DeckPlan | null {
  if (stored && stored.result.proposals.length > 0) {
    const preferred =
      stored.result.proposals.find((proposal) => proposal.strategy === DEFAULT_STRATEGY) ?? stored.result.proposals[0]
    if (preferred?.deckPlan) return preferred.deckPlan
  }
  const fromCache = cachedPlanSet?.plans?.[0]?.deck_plan
  if (fromCache && Array.isArray(fromCache.slides)) return fromCache as DeckPlan
  return null
}

export function StylePage() {
  const { projectId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [storedOverride, setStoredOverride] = useState<{ projectId: string; value: StoredPlanRequest | null } | null>(null)
  const freshStored = useMemo(() => readPlanRequest(projectId), [projectId])
  const stored = storedOverride?.projectId === projectId ? storedOverride.value : freshStored
  const [autoPlanning, setAutoPlanning] = useState(false)
  const autoPlanAttemptedRef = useRef<string | null>(null)
  const previewStartedForPlanRef = useRef<string | null>(null)

  const sessionQuery = useAssistantSession(projectId)
  const session = sessionQuery.data
  const { data: project } = useProject(projectId)

  const planIdFromQuery = searchParams.get('planId')
  const planId = planIdFromQuery ?? stored?.result.planId ?? session?.artifacts.plan_id ?? null

  const cachedPlanSet = planId ? queryClient.getQueryData<PlanSet>(assistantKeys.plan(planId)) : undefined
  const basePlan = useMemo(() => selectProposalPlan(stored, cachedPlanSet), [stored, cachedPlanSet])
  const { plan: activePlan, draftKey } = useMemo(() => readEditedPlan(projectId, basePlan), [projectId, basePlan])

  const templateId = stored?.request.template_id ?? session?.artifacts.template_id ?? project?.template_id ?? null
  const contentPackId = stored?.request.content_pack_id ?? session?.artifacts.content_pack_id ?? project?.content_pack_id ?? null

  useEffect(() => {
    if (stored || !templateId || !contentPackId) return
    if (sessionQuery.isPending) return
    const key = `${projectId}:${templateId}:${contentPackId}`
    if (autoPlanAttemptedRef.current === key) return
    autoPlanAttemptedRef.current = key
    setAutoPlanning(true)
    const rawBrief = session?.brief ?? {}
    const purpose = typeof rawBrief.purpose === 'string' && rawBrief.purpose.trim() ? rawBrief.purpose : 'Итоги проекта'
    const audience = typeof rawBrief.audience === 'string' ? rawBrief.audience : ''
    const language = typeof rawBrief.language === 'string' && rawBrief.language.trim() ? rawBrief.language : 'ru'
    const targetSlideCount = typeof rawBrief.target_slide_count === 'number' ? rawBrief.target_slide_count : (project?.target_slide_count ?? 8)
    requestAndStorePlan(projectId, {
      template_id: templateId,
      content_pack_id: contentPackId,
      strategies: [DEFAULT_STRATEGY],
      brief: {
        purpose,
        audience,
        language,
        target_slide_count: targetSlideCount,
      },
      use_llm: false,
    })
      .then((nextStored) => {
        setStoredOverride({ projectId, value: nextStored })
      })
      .catch(() => undefined)
      .finally(() => {
        setAutoPlanning(false)
      })
  }, [stored, templateId, contentPackId, sessionQuery.isPending, projectId, session?.brief, project?.target_slide_count])

  const startPreviews = useStartStylePreviews(planId ?? '')
  const { mutate: triggerStartPreviews } = startPreviews

  useEffect(() => {
    if (!planId) return
    if (previewStartedForPlanRef.current === planId) return
    previewStartedForPlanRef.current = planId
    triggerStartPreviews({})
  }, [planId, triggerStartPreviews])

  const acceptedPreview = startPreviews.data
  const previewId = acceptedPreview?.preview_id ?? session?.artifacts.preview_id ?? null
  const jobId = acceptedPreview?.job_id ?? null

  const jobEvents = useJobEvents(jobId)
  const isStreaming = Boolean(jobId) && !jobEvents.done && !jobEvents.error

  const stylePreviewQuery = useStylePreview(previewId)
  const stylePreview = stylePreviewQuery.data

  const unsupported =
    startPreviews.isSuccess &&
    acceptedPreview === null &&
    !session?.artifacts.preview_id &&
    !stylePreview

  const hasPlan = Boolean(planId || activePlan || autoPlanning || (templateId && contentPackId))

  const columns = useMemo(
    () =>
      buildStyleColumns({
        preview: stylePreview,
        events: jobEvents.events,
        isStreaming,
        plan: activePlan,
        unsupported,
      }),
    [stylePreview, jobEvents.events, isStreaming, activePlan, unsupported],
  )

  const recommendedStrategy = useMemo(() => resolveRecommendedStrategy(columns), [columns])
  const [userPickedStrategy, setUserPickedStrategy] = useState<CatalogStrategy | null>(null)
  const selectedStrategy: CatalogStrategy = userPickedStrategy ?? recommendedStrategy
  const selectedColumn = columns.find((col) => col.strategy === selectedStrategy) ?? columns[0]

  const [compareSlideId, setCompareSlideId] = useState<string | null>(null)
  const [buildingMode, setBuildingMode] = useState<'single' | 'all' | null>(null)

  const autopilot = useStartAutopilot(projectId)
  const columnRefs = useRef<Partial<Record<CatalogStrategy, HTMLDivElement | null>>>({})

  const assistantNote = resolveStyleAssistantNote({
    preview: stylePreview,
    events: jobEvents.events,
    sessionNote: session?.assistant_note,
    isStreaming: isStreaming || startPreviews.isPending || autoPlanning,
    unsupported,
    hasPlan,
  })

  const readySlotsCount = columns.reduce(
    (sum, col) => sum + col.slots.filter((slot) => slot.state === 'ready').length,
    0,
  )

  const handleBuild = (mode: 'single' | 'all') => {
    const strategies: readonly CatalogStrategy[] = mode === 'all' ? STRATEGY_ORDER : [selectedStrategy]
    const payload = buildGenerationPayload({
      stored,
      plan: activePlan,
      session,
      project,
      previewId,
      strategies,
    })
    if (!payload) return
    setBuildingMode(mode)
    const trackingId = startGeneration(projectId, payload)
    whenGenerationAccepted(trackingId)?.then(
      (accepted) => {
        rememberRun(projectId, accepted.generation_id)
        if (draftKey) clearPlanDraft(draftKey)
      },
      () => undefined,
    )
    navigate(routes.run(projectId, trackingId), {
      state: {
        fromStyle: true,
        strategies: [...strategies],
        deckPlan: payload.deck_plan ?? activePlan ?? null,
        previewId,
      },
    })
  }

  const handleAutopilot = async () => {
    try {
      const accepted = await autopilot.mutateAsync({
        from_step: 5,
        use_llm: stored?.request.use_llm ?? false,
        ...(stored?.request.provider_session_id ? { provider_session_id: stored.request.provider_session_id } : {}),
      })
      if (accepted?.job_id) {
        navigate(routes.run(projectId, accepted.job_id), {
          state: {
            fromStyle: true,
            fromAutopilot: true,
            deckPlan: activePlan ?? null,
            previewId,
          },
        })
      } else {
        handleBuild('single')
      }
    } catch {
      return
    }
  }

  if (!hasPlan && !sessionQuery.isPending) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Шаг 5 · Стиль"
          title="Выбери стиль вёрстки"
          description="Примерил три подхода на ключевых слайдах вашего плана — кликните слайд для сравнения."
        />
        <div className={styles.assistantStrip} role="status" aria-live="polite">
          <p className={styles.assistantNote}>
            <Icon as={Sparkles} size={15} />
            <span className={styles.noteText}>{assistantNote}</span>
          </p>
        </div>
        <EmptyState
          title="Плана пока нет"
          description="Сначала согласуйте структуру презентации на шаге «План», чтобы примерить стили вёрстки."
          actions={
            <Link className={styles.secondaryLink} to={routes.planDraft(projectId)}>
              Перейти к плану
            </Link>
          }
        />
      </div>
    )
  }

  const canBuild = Boolean(
    buildGenerationPayload({
      stored,
      plan: activePlan,
      session,
      project,
      previewId,
      strategies: [selectedStrategy],
    }),
  )
  const isSubmitting = buildingMode !== null || autopilot.isPending

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Шаг 5 · Стиль"
        title="Выбери стиль вёрстки"
        description="Примерил три подхода на ключевых слайдах вашего плана — кликните слайд для сравнения."
        actions={
          <Button
            variant="secondary"
            size="md"
            disabled={!canBuild || isSubmitting}
            title="Приму безопасные настройки по умолчанию и соберу колоду по подтверждённым фактам"
            onClick={() => void handleAutopilot()}
          >
            <Icon as={Sparkles} size={14} />
            {autopilot.isPending ? 'Запускаю сборку…' : 'Сделай сам'}
          </Button>
        }
      />

      <div className={styles.assistantStrip} role="status" aria-live="polite" data-testid="assistant-note">
        <p className={styles.assistantNote}>
          <Icon as={Sparkles} size={15} />
          <span key={assistantNote} className={styles.noteText}>
            {assistantNote}
          </span>
        </p>
        {stylePreview?.seconds != null && readySlotsCount > 0 && (
          <Mono className={styles.timingMeta}>
            Отрендерено {readySlotsCount} пробных слайдов за {stylePreview.seconds.toFixed(1).replace('.', ',')} с
          </Mono>
        )}
      </div>

      {startPreviews.isError && (
        <div className={styles.errorBanner} role="alert">
          <span>
            Не удалось запустить отрисовку превью стилей:{' '}
            {startPreviews.error instanceof Error ? startPreviews.error.message : 'ошибка связи с сервисом'}. Вы всё равно можете
            выбрать стиль и собрать презентацию.
          </span>
          {planId && (
            <Button size="sm" variant="secondary" onClick={() => triggerStartPreviews({})}>
              Повторить превью
            </Button>
          )}
        </div>
      )}

      <div className={styles.grid} role="radiogroup" aria-label="Стиль вёрстки">
        {columns.map((column, colIndex) => {
          const isSelected = column.strategy === selectedStrategy
          return (
            <div
              key={column.strategy}
              ref={(node) => {
                columnRefs.current[column.strategy] = node
              }}
              role="radio"
              aria-checked={isSelected}
              aria-label={column.title}
              tabIndex={isSelected ? 0 : -1}
              data-strategy={column.strategy}
              data-recommended={column.recommended ? 'true' : undefined}
              className={clsx(styles.column, isSelected && styles.columnSelected)}
              onClick={() => setUserPickedStrategy(column.strategy)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault()
                  setUserPickedStrategy(column.strategy)
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  const next = columns[(colIndex + 1) % columns.length]
                  if (next) {
                    setUserPickedStrategy(next.strategy)
                    columnRefs.current[next.strategy]?.focus()
                  }
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const prev = columns[(colIndex - 1 + columns.length) % columns.length]
                  if (prev) {
                    setUserPickedStrategy(prev.strategy)
                    columnRefs.current[prev.strategy]?.focus()
                  }
                }
              }}
            >
              <header className={styles.columnHead}>
                <div className={styles.titleRow}>
                  <div className={styles.titleLeft}>
                    <span className={styles.radioDot} aria-hidden="true">
                      <Icon as={Check} size={11} strokeWidth={3} />
                    </span>
                    <h2 className={styles.columnTitle}>{column.title}</h2>
                  </div>
                  <div className={styles.badges}>
                    {column.recommended && (
                      <Badge tone="ink">
                        <span aria-hidden="true">★ </span>
                        <span>советую</span>
                      </Badge>
                    )}
                    <Badge tone="neutral" mono>
                      {column.strategy}
                    </Badge>
                  </div>
                </div>
                <p className={styles.difference}>{column.difference}</p>
              </header>

              {column.error && (
                <p className={styles.columnError}>
                  Не удалось отрисовать превью этого стиля — сама сборка в нём остаётся доступной.
                </p>
              )}

              <div className={styles.slots}>
                {column.slots.map((slot) => (
                  <div key={slot.slideId} className={styles.slotBox}>
                    <div className={styles.slotMeta}>
                      <Mono className={styles.slotIndex}>
                        Слайд {formatIndex(slot.slideNumber)}
                        {slot.purposeLabel ? ` · ${slot.purposeLabel}` : ''}
                      </Mono>
                      <button
                        type="button"
                        className={styles.zoomBtn}
                        aria-label={`Увеличить слайд ${slot.slideNumber} (${column.title})`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setCompareSlideId(slot.slideId)
                        }}
                      >
                        <Icon as={Search} size={11} />
                        <span>Сравнить</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className={styles.canvasButton}
                      aria-label={`Открыть сравнение слайда ${slot.slideNumber}: ${slot.title} (${column.title})`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setCompareSlideId(slot.slideId)
                      }}
                    >
                      {slot.state === 'ready' && slot.imageUrl ? (
                        <img
                          className={styles.previewImage}
                          src={slot.imageUrl}
                          alt={`${column.title} — слайд ${slot.slideNumber}: ${slot.title}`}
                        />
                      ) : slot.state === 'loading' ? (
                        <div className={styles.loadingFrame}>
                          <span className={styles.slotPlanTitle}>{slot.title}</span>
                          <div className={styles.loadingBars} aria-hidden="true">
                            <span className={styles.loadingBar} />
                            <span className={styles.loadingBarShort} />
                          </div>
                          <span className={styles.loadingCaption}>{slot.loadingCaption}</span>
                        </div>
                      ) : (
                        <div className={styles.draftFrame}>
                          <span className={styles.slotPlanTitle}>{slot.title}</span>
                          <span className={styles.loadingCaption}>
                            {slot.state === 'error' ? 'Превью недоступно' : 'По структуре вашего плана'}
                          </span>
                        </div>
                      )}
                    </button>

                    <div className={styles.slotFooter}>
                      <Mono>{slot.exemplar ?? 'Макет по правилам шаблона'}</Mono>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerMeta}>
          <span>
            Выбран стиль: <strong>{selectedColumn?.title}</strong>
          </span>
          <span>·</span>
          <span>Образцы превью сохранятся при полной сборке</span>
        </div>
        <div className={styles.footerActions}>
          <Button
            variant="secondary"
            size="lg"
            disabled={!canBuild || isSubmitting}
            onClick={() => handleBuild('all')}
          >
            {buildingMode === 'all' ? 'Запускаю сборку…' : 'Собрать во всех трёх'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!canBuild || isSubmitting}
            onClick={() => handleBuild('single')}
          >
            {buildingMode === 'single' ? 'Запускаю сборку…' : 'Собрать в этом стиле'}
            <Icon as={ArrowRight} size={16} />
          </Button>
        </div>
      </footer>

      <StyleCompareDialog
        open={compareSlideId !== null}
        slideId={compareSlideId}
        columns={columns}
        selectedStrategy={selectedStrategy}
        onSelectStrategy={setUserPickedStrategy}
        onSelectSlide={setCompareSlideId}
        onOpenChange={(open) => {
          if (!open) setCompareSlideId(null)
        }}
        onBuildSelected={() => handleBuild('single')}
        buildDisabled={!canBuild || isSubmitting}
      />
    </div>
  )
}
