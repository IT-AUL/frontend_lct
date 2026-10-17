import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  assistantKeys,
  useAddNotes,
  useAssistantSession,
  useEditBlocks,
  useEditInsight,
  useQuestions,
  useStartAutopilot,
  useSubmitAnswers,
  useUnderstanding,
  type BlockOps,
  type InsightPatch,
  type Understanding,
} from '@/entities/assistant'
import { useContentPack } from '@/entities/content-pack'
import { requestJson } from '@/shared/api'
import { rememberRun, useProject } from '@/entities/project'
import { useActiveProviderSession } from '@/entities/provider-session'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { isAbortError, PlanBuildProgress, requestAndStorePlan, usePlanBuild } from '@/features/edit-deck-plan'
import { routes } from '@/shared/config'
import {
  ArrowRight,
  Badge,
  Button,
  EmptyState,
  Icon,
  Mono,
  PageHeader,
  Plus,
  RefreshCw,
  Skeleton,
  Sparkles,
  Wand2,
} from '@/shared/ui'
import {
  applyOptimisticBlockOps,
  applyOptimisticInsightPatch,
  applyOptimisticNotes,
  BLOCK_KIND_LABEL,
  chartTypeLabel,
  extractContextBadges,
  fallbackUnderstandingFromContentPack,
  formatCapacitySlides,
  normalizeBlockKind,
  resolveUnderstandingNote,
  type BlockKindKey,
} from '../lib/understanding'
import { BlockCard } from './BlockCard'
import { InsightCard } from './InsightCard'
import { SparkChart } from './SparkChart'
import styles from './UnderstandingPage.module.css'

interface UndoEntry {
  packId: string
  snapshot: Understanding
}

const FILTER_KINDS: readonly ('all' | BlockKindKey)[] = ['all', 'topic', 'fact', 'number', 'data', 'process', 'quote']

function errorMessage(error: unknown): string | null {
  if (!error || isAbortError(error)) return null
  return error instanceof Error ? error.message : String(error)
}

export function UnderstandingPage() {
  const { projectId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId)
  const { data: session, isLoading: sessionLoading } = useAssistantSession(projectId)
  const providerSession = useActiveProviderSession()
  const modelAuto = useCapabilityFlag(FEATURE_PATHS.modelAuto)
  const useLlm = Boolean(providerSession) || modelAuto

  const initialPackId = session?.artifacts.content_pack_id ?? project?.content_pack_id ?? searchParams.get('pack') ?? null
  const [overridePackId, setOverridePackId] = useState<string | null>(null)
  const activePackId = overridePackId ?? initialPackId
  const templateId = session?.artifacts.template_id ?? project?.template_id ?? null

  const understandingQuery = useUnderstanding(activePackId, { useLlm })
  const unsupportedUnderstanding = understandingQuery.isFetched && understandingQuery.data === null && Boolean(activePackId)
  const { data: legacyPack, isLoading: legacyLoading } = useContentPack(unsupportedUnderstanding ? activePackId : null)

  const [optimistic, setOptimistic] = useState<Understanding | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<'all' | BlockKindKey>('all')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteInput, setNoteInput] = useState('')
  const [buildingPlan, setBuildingPlan] = useState(false)
  const [ ExpandedDatasetIds, setExpandedDatasetIds ] = useState<Record<string, boolean>>({})

  const editBlocks = useEditBlocks(activePackId ?? '')
  const editInsight = useEditInsight(activePackId ?? '')
  const addNotes = useAddNotes(activePackId ?? '')
  const questionsQuery = useQuestions(projectId)
  const submitAnswers = useSubmitAnswers(projectId)
  const autopilot = useStartAutopilot(projectId)
  const planBuild = usePlanBuild()

  const baseUnderstanding = useMemo(() => {
    if (understandingQuery.data) return understandingQuery.data
    if (unsupportedUnderstanding && legacyPack) return fallbackUnderstandingFromContentPack(legacyPack)
    return null
  }, [understandingQuery.data, unsupportedUnderstanding, legacyPack])

  const currentUnderstanding = optimistic ?? baseUnderstanding

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      const last = prev.at(-1)
      if (!last) return prev
      setOverridePackId(last.packId)
      setOptimistic(last.snapshot)
      queryClient.setQueryData([...assistantKeys.understanding(last.packId), { useLlm }], last.snapshot)
      setFeedbackNote('Вернул предыдущий состав материалов.')
      setActionError(null)
      return prev.slice(0, -1)
    })
  }, [queryClient, useLlm])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        const target = event.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
        if (undoStack.length > 0) {
          event.preventDefault()
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undoStack.length, handleUndo])

  const runBlockOps = async (ops: BlockOps['ops'], noteMessage: string) => {
    if (!currentUnderstanding || !activePackId) return
    const prevPackId = activePackId
    const prevSnapshot = currentUnderstanding
    setUndoStack((stack) => [...stack, { packId: prevPackId, snapshot: prevSnapshot }])
    const nextOptimistic = applyOptimisticBlockOps(prevSnapshot, ops)
    setOptimistic(nextOptimistic)
    setFeedbackNote(noteMessage)
    setActionError(null)

    if (unsupportedUnderstanding) return

    try {
      const result = await editBlocks.mutateAsync({ ops })
      if (result?.content_pack_id && result.understanding) {
        queryClient.setQueryData([...assistantKeys.understanding(result.content_pack_id), { useLlm }], result.understanding)
        setOverridePackId(result.content_pack_id)
        setOptimistic(result.understanding)
      }
    } catch (error) {
      const status = (error as { status?: number })?.status
      if (status === 422 && ops.some((op) => op.op === 'move' || op.op === 'merge')) {
        return
      }
      setOptimistic(prevSnapshot)
      setUndoStack((stack) => stack.slice(0, -1))
      setActionError(errorMessage(error))
    }
  }

  const handleRemoveBlock = (blockId: string) => {
    void runBlockOps([{ op: 'remove', block_id: blockId }], 'Обновил состав материалов — вернуть прошлое состояние можно по Ctrl+Z.')
  }

  const handleMoveBlock = (blockId: string, targetIndex: number) => {
    void runBlockOps([{ op: 'move', block_id: blockId, index: targetIndex }], 'Изменил порядок блоков — отменить можно по Ctrl+Z.')
  }

  const handleMergeBlock = (blockId: string, intoId: string) => {
    void runBlockOps([{ op: 'merge', block_id: blockId, into: intoId }], 'Объединил смысловые блоки — отменить можно по Ctrl+Z.')
  }

  const handleEditBlock = (blockId: string, patch: { title?: string; text?: string }) => {
    void runBlockOps([{ op: 'edit', block_id: blockId, ...patch }], 'Сохранил вашу формулировку блока.')
  }

  const handlePatchInsight = async (insightId: string, patch: InsightPatch) => {
    if (!currentUnderstanding || !activePackId) return
    const prevSnapshot = currentUnderstanding
    const nextOptimistic = applyOptimisticInsightPatch(prevSnapshot, insightId, patch)
    setOptimistic(nextOptimistic)
    queryClient.setQueryData([...assistantKeys.understanding(activePackId), { useLlm }], nextOptimistic)
    setFeedbackNote(patch.confirmed ? 'Отметил вывод для ключевых слайдов презентации.' : 'Обновил статус вывода.')
    setActionError(null)

    if (unsupportedUnderstanding) return

    try {
      await editInsight.mutateAsync({ insightId, ...patch })
    } catch (error) {
      setOptimistic(prevSnapshot)
      setActionError(errorMessage(error))
    }
  }

  const handleAddNote = async () => {
    const clean = noteInput.trim()
    if (!clean || !currentUnderstanding || !activePackId) return
    const prevPackId = activePackId
    const prevSnapshot = currentUnderstanding
    setUndoStack((stack) => [...stack, { packId: prevPackId, snapshot: prevSnapshot }])
    setOptimistic(applyOptimisticNotes(prevSnapshot, [clean]))
    setNoteInput('')
    setNoteOpen(false)
    setFeedbackNote('Добавил ваш тезис в состав материалов — отменить можно по Ctrl+Z.')
    setActionError(null)

    if (unsupportedUnderstanding) return

    try {
      const result = await addNotes.mutateAsync({ items: [clean] })
      if (result?.content_pack_id && result.understanding) {
        queryClient.setQueryData([...assistantKeys.understanding(result.content_pack_id), { useLlm }], result.understanding)
        setOverridePackId(result.content_pack_id)
        setOptimistic(result.understanding)
      }
    } catch (error) {
      setOptimistic(prevSnapshot)
      setUndoStack((stack) => stack.slice(0, -1))
      setActionError(errorMessage(error))
    }
  }

  const handleStartAutopilot = async () => {
    setActionError(null)
    try {
      const accepted = await autopilot.mutateAsync({
        from_step: 2,
        use_llm: useLlm,
        ...(useLlm && providerSession?.id ? { provider_session_id: providerSession.id } : {}),
      })
      if (!accepted) {
        navigate(routes.brief(projectId))
        return
      }
      if (accepted.assistant_note) setFeedbackNote(accepted.assistant_note)
      if (accepted.job_id) {
        try {
          const job = await requestJson<{ result_ids?: Record<string, string> }>(`/jobs/${encodeURIComponent(accepted.job_id)}`)
          const genId = job.result_ids?.generation_id
          if (genId) {
            rememberRun(projectId, genId)
            navigate(routes.run(projectId, genId))
            return
          }
        } catch {
          void 0
        }
        navigate(routes.run(projectId, accepted.job_id))
      }
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  const handleContinue = async () => {
    setActionError(null)
    if (unsupportedUnderstanding && !questionsQuery.data) {
      navigate(routes.brief(projectId))
      return
    }
    const qData = questionsQuery.data
    if (qData && qData.questions.length === 0) {
      if (session) {
        queryClient.setQueryData(assistantKeys.session(projectId), {
          ...session,
          step: 4,
          completed_steps: [...new Set([...session.completed_steps, 1, 2])],
          skipped_steps: [...new Set([...session.skipped_steps, 3])],
        })
      }
      if (templateId && activePackId) {
        setBuildingPlan(true)
        const options = planBuild.begin()
        planBuild.enterPhase('plan')
        try {
          const answered = await submitAnswers.mutateAsync({ answers: {} })
          const rawBrief = answered?.brief ?? qData.suggested_brief ?? currentUnderstanding?.brief ?? {}
          await requestAndStorePlan(
            projectId,
            {
              template_id: templateId,
              content_pack_id: activePackId,
              brief: {
                purpose: String(rawBrief.purpose || 'presentation'),
                audience: String(rawBrief.audience ?? ''),
                language: String(rawBrief.language || project?.default_language || 'ru'),
                target_slide_count: Number(rawBrief.target_slide_count || project?.target_slide_count || 8),
                ...(rawBrief.content_fill ? { content_fill: rawBrief.content_fill as 'expand' | 'shrink' | 'ask' } : {}),
              },
              strategies: ['balanced'],
              use_llm: useLlm,
              ...(useLlm && providerSession?.id ? { provider_session_id: providerSession.id } : {}),
            },
            {},
            options,
          )
        } catch {
          void 0
        } finally {
          planBuild.finish()
          setBuildingPlan(false)
        }
      }
      navigate(routes.planDraft(projectId))
      return
    }
    navigate(routes.questions(projectId))
  }

  if (projectError) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Понимание материала" title="Вот что я понял" />
        <EmptyState title="Не удалось открыть проект" description={projectError.message} />
      </div>
    )
  }

  const isLoading = projectLoading || sessionLoading || (Boolean(activePackId) && understandingQuery.isLoading) || (unsupportedUnderstanding && legacyLoading)

  if (isLoading) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Загрузка разбора материалов">
        <PageHeader
          eyebrow="Понимание материала"
          title="Вот что я понял"
          description="Разбираю структуру материалов, таблицы и ключевые факты…"
        />
        <Skeleton className={styles.skeletonSummary} />
        <Skeleton className={styles.skeletonDataset} delay={0.05} />
        <div className={styles.blocksGrid}>
          <Skeleton className={styles.skeletonCard} delay={0.1} />
          <Skeleton className={styles.skeletonCard} delay={0.15} />
          <Skeleton className={styles.skeletonCard} delay={0.2} />
        </div>
      </div>
    )
  }

  if (buildingPlan) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Понял сам → План"
          title="Составляю план презентации"
          description="Все параметры понятны из ваших материалов — лишних вопросов не задаю."
        />
        <PlanBuildProgress
          progress={planBuild.progress}
          phase={planBuild.phase}
          startedAt={planBuild.startedAt}
          onCancel={planBuild.cancel}
        />
      </div>
    )
  }

  if (!activePackId) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Понимание материала"
          title="Вот что я понял"
          description="Чтобы разобрать структуру и цифры, сначала добавьте файлы или идею презентации."
        />
        <EmptyState
          title="Материалы ещё не загружены"
          description="Перейдите на первый шаг и загрузите текстовые файлы, таблицы данных или опишите тему одной фразой."
          actions={
            <div className={styles.footerActions}>
              <Link className={styles.linkButton} to={routes.start(projectId)}>
                К шагу 1 «Закинь, что есть»
              </Link>
              <Link className={styles.linkButton} to={routes.brief(projectId)}>
                Классический бриф
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (understandingQuery.error) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Понимание материала" title="Вот что я понял" />
        <EmptyState
          title="Не удалось разобрать материалы"
          description={understandingQuery.error.message}
          actions={
            <div className={styles.footerActions}>
              <Button variant="primary" onClick={() => void understandingQuery.refetch()}>
                <Icon as={RefreshCw} size={14} />
                Повторить
              </Button>
              <Link className={styles.linkButton} to={routes.brief(projectId)}>
                Перейти к брифу
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!currentUnderstanding) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Понимание материала"
          title="Вот что я понял"
          description="Подробный разбор блоков на этом стенде недоступен — можно сразу перейти к брифу и плану."
        />
        <EmptyState
          title="Разбор блоков недоступен"
          description="Продолжите по классическому сценарию: настройте параметры брифа и составьте план колоды."
          actions={
            <div className={styles.footerActions}>
              <Link className={styles.linkButton} to={routes.brief(projectId)}>
                Перейти к брифу
              </Link>
              <Link className={styles.linkButton} to={routes.questions(projectId)}>
                К вопросам
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  const assistantNote = resolveUnderstandingNote(currentUnderstanding, session?.assistant_note, feedbackNote)
  const contextBadges = extractContextBadges(currentUnderstanding.context)
  const interpretationPending = currentUnderstanding.interpretation?.status === 'pending'
  const blocks = currentUnderstanding.blocks
  const datasets = currentUnderstanding.datasets
  const availableKinds = new Set(blocks.map((block) => normalizeBlockKind(block.kind)))
  const filteredBlocks = kindFilter === 'all' ? blocks : blocks.filter((block) => normalizeBlockKind(block.kind) === kindFilter)
  const totalInsights = datasets.reduce((acc, ds) => acc + ds.insights.length, 0)
  const confirmedInsights = datasets.reduce((acc, ds) => acc + ds.insights.filter((i) => i.confirmed).length, 0)

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Понимание материала"
        title="Вот что я понял"
        description="Проверьте выводы по таблицам и смысловые блоки: лишнее можно убрать, порядок — поменять, а рекомендации — подтвердить."
        actions={
          <div className={styles.footerActions}>
            <Button
              variant="secondary"
              size="md"
              disabled={autopilot.isPending}
              title="Приму безопасные настройки по умолчанию и соберу колоду по подтверждённым фактам"
              onClick={() => void handleStartAutopilot()}
            >
              <Icon as={Wand2} size={14} />
              {autopilot.isPending ? 'Запускаю…' : 'Сделай сам'}
            </Button>
            <Button variant="primary" size="md" onClick={() => void handleContinue()}>
              Дальше
              <Icon as={ArrowRight} size={14} />
            </Button>
          </div>
        }
      />

      <section className={styles.assistantBar} aria-label="Помощник">
        <div className={styles.assistantRow}>
          <p className={styles.assistantNote} aria-live="polite">
            <Icon as={Sparkles} size={16} />
            <span>{assistantNote}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNoteOpen((prev) => !prev)}
          >
            <Icon as={Plus} size={12} />
            Добавить свой тезис
          </Button>
        </div>
        {noteOpen && (
          <form
            className={styles.noteForm}
            onSubmit={(event) => {
              event.preventDefault()
              void handleAddNote()
            }}
          >
            <input
              type="text"
              className={styles.noteInput}
              value={noteInput}
              placeholder="Напишите короткий тезис своими словами…"
              aria-label="Новый тезис автора"
              onChange={(event) => setNoteInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNoteOpen(false)
              }}
            />
            <Button type="submit" variant="primary" size="sm" disabled={!noteInput.trim() || addNotes.isPending}>
              Добавить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
              Отмена
            </Button>
          </form>
        )}
      </section>

      {unsupportedUnderstanding && (
        <div className={styles.fallbackBanner} role="status">
          <span>Показаны разделы из загруженного контент-пака. При необходимости вы можете перейти к полному брифу.</span>
          <Link className={styles.linkButton} to={routes.brief(projectId)}>
            Открыть классический бриф
          </Link>
        </div>
      )}

      {actionError && (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      )}

      <section className={styles.summaryBanner} aria-label="Сводка по материалам">
        <div className={styles.summaryLeft}>
          <div className={styles.summaryTopRow}>
            <Badge tone={(currentUnderstanding.summary.capacity_slides ?? 0) <= 3 && datasets.length === 0 ? 'warn' : 'ink'}>
              {formatCapacitySlides(currentUnderstanding.summary.capacity_slides)}
            </Badge>
            {(currentUnderstanding.summary.capacity_slides ?? 0) <= 3 && datasets.length === 0 && (
              <Badge tone="warn" shape="tag">
                Материала мало — помогу на следующем шаге
              </Badge>
            )}
            {questionsQuery.data && questionsQuery.data.questions.length === 0 && (
              <Badge tone="ok" dot title="Аудитория, объём и главная мысль уже ясны из материалов">
                Вопросы не нужны · понял сам
              </Badge>
            )}
          </div>

          {currentUnderstanding.summary.main_points.length > 0 && (
            <div className={styles.mainPoints}>
              <span className={styles.mainPointsLabel}>Главное, что я вижу:</span>
              {currentUnderstanding.summary.main_points.map((point, idx) => (
                <span key={`${point}-${idx}`} className={styles.pointChip}>
                  {point}
                </span>
              ))}
            </div>
          )}

          {contextBadges.length > 0 && (
            <div className={styles.contextRow}>
              <span className={styles.contextLabel}>Из вашего текста:</span>
              {contextBadges.map((item) => (
                <Badge
                  key={item.field}
                  tone="ok"
                  shape="tag"
                  title={item.quote ? `Цитата: «${item.quote}»` : undefined}
                >
                  {item.label}: {item.value}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className={styles.summaryRight}>
          <Button
            variant="secondary"
            size="sm"
            disabled={undoStack.length === 0}
            aria-label="Отменить последнюю правку (Ctrl+Z)"
            onClick={handleUndo}
          >
            ↶ Отменить (Ctrl+Z){undoStack.length > 0 ? ` · ${undoStack.length}` : ''}
          </Button>
        </div>
      </section>

      {datasets.length > 0 && (
        <section className={styles.section} aria-label="Выводы по данным">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleGroup}>
              <h2 className={styles.sectionTitle}>Выводы по вашим данным</h2>
              <Badge tone="neutral" mono>
                {datasets.length} {datasets.length === 1 ? 'таблица' : 'таблицы'} · {totalInsights} {totalInsights === 1 ? 'вывод' : 'выводов'}
              </Badge>
            </div>
          </div>

          {datasets.map((dataset) => {
            const dataBlock = blocks.find((b) => b.dataset_id === dataset.id || b.id === `ds:${dataset.id}`)
            const isExpanded = Boolean(ExpandedDatasetIds[dataset.id])
            const visibleInsights = isExpanded ? dataset.insights : dataset.insights.slice(0, 6)
            const hiddenCount = Math.max(0, dataset.insights.length - visibleInsights.length)

            return (
              <div key={dataset.id} className={styles.datasetCard} aria-label={`Датасет ${dataset.title ?? dataset.id}`}>
                <div className={styles.datasetTop}>
                  <div className={styles.datasetMeta}>
                    <div className={styles.datasetTitleRow}>
                      <h3 className={styles.datasetTitle}>{dataset.title ?? 'Таблица данных'}</h3>
                      {dataset.file && (
                        <Badge tone="neutral" shape="tag" mono>
                          {dataset.file}
                        </Badge>
                      )}
                      <Badge tone="ok" shape="tag">
                        ваши данные
                      </Badge>
                      {(dataset.task_ru || dataset.task) && (
                        <Badge tone="info">
                          Задача: {dataset.task_ru ?? dataset.task}
                        </Badge>
                      )}
                    </div>

                    {dataset.profile_summary && (
                      <p className={styles.datasetProfile}>{dataset.profile_summary}</p>
                    )}

                    {dataset.why && (
                      <p className={styles.datasetWhy}>Выбор визуализации: {dataset.why}</p>
                    )}

                    {dataset.recommendations.length > 0 && (
                      <div className={styles.recRow}>
                        <span className={styles.recLabel}>Подходящие графики:</span>
                        {dataset.recommendations.map((rec, idx) => (
                          <Badge
                            key={`${rec.chart_type}-${idx}`}
                            tone={idx === 0 ? 'ink' : 'neutral'}
                            shape="tag"
                            title={rec.reasons.join(' · ')}
                          >
                            {idx === 0 ? '★ ' : ''}
                            {chartTypeLabel(rec.chart_type)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <SparkChart
                    preview={dataBlock?.preview}
                    chartType={dataset.recommendations[0]?.chart_type}
                    title={dataset.title}
                  />
                </div>

                <div className={styles.insightsGrid}>
                  {visibleInsights.map((insight, idx) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      preview={idx === 0 ? dataBlock?.preview : null}
                      interpretationPending={interpretationPending}
                      disabled={editInsight.isPending}
                      onPatch={(id, patch) => void handlePatchInsight(id, patch)}
                    />
                  ))}
                </div>

                {dataset.insights.length > 6 && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExpandedDatasetIds((prev) => ({ ...prev, [dataset.id]: !prev[dataset.id] }))
                      }
                    >
                      {isExpanded ? 'Свернуть второстепенные выводы' : `Показать ещё ${hiddenCount} выводов`}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      <section className={styles.section} aria-label="Смысловые блоки">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleGroup}>
            <h2 className={styles.sectionTitle}>Смысловые блоки из материалов</h2>
            <Badge tone="neutral" mono>
              {blocks.length}
            </Badge>
          </div>

          {availableKinds.size > 1 && (
            <div className={styles.filterRow} role="group" aria-label="Фильтр по типу блока">
              {FILTER_KINDS.filter((kind) => kind === 'all' || availableKinds.has(kind)).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={styles.filterChip}
                  aria-pressed={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                >
                  {kind === 'all' ? 'Все' : BLOCK_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          )}
        </div>

        {filteredBlocks.length === 0 ? (
          <EmptyState
            title="Нет смысловых блоков"
            description={
              undoStack.length > 0
                ? 'Вы убрали все блоки. Можно вернуть предыдущее состояние по Ctrl+Z или добавить свой тезис.'
                : 'Добавьте тезис своими словами или вернитесь на шаг загрузки материалов.'
            }
            actions={
              <div className={styles.footerActions}>
                {undoStack.length > 0 && (
                  <Button variant="secondary" onClick={handleUndo}>
                    ↶ Отменить (Ctrl+Z)
                  </Button>
                )}
                <Button variant="primary" onClick={() => setNoteOpen(true)}>
                  <Icon as={Plus} size={14} />
                  Добавить тезис
                </Button>
              </div>
            }
          />
        ) : (
          <div className={styles.blocksGrid}>
            {filteredBlocks.map((block) => {
              const realIndex = blocks.findIndex((item) => item.id === block.id)
              const nextBlock = blocks[realIndex + 1] ?? blocks[realIndex - 1] ?? null
              return (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={realIndex}
                  total={blocks.length}
                  datasets={datasets}
                  mergeTargetId={nextBlock ? nextBlock.id : null}
                  mergeTargetTitle={nextBlock?.title ?? nextBlock?.text ?? null}
                  disabled={editBlocks.isPending}
                  onRemove={handleRemoveBlock}
                  onMove={handleMoveBlock}
                  onMerge={handleMergeBlock}
                  onEdit={handleEditBlock}
                />
              )
            })}
          </div>
        )}
      </section>

      <footer className={styles.footerBar} aria-label="Действия шага">
        <div className={styles.footerMeta}>
          <Mono>
            Блоков: {blocks.length}
            {totalInsights > 0 ? ` · Выводов: ${totalInsights} (отмечено: ${confirmedInsights})` : ''}
          </Mono>
          {undoStack.length > 0 && <span>Доступна отмена по Ctrl+Z</span>}
        </div>

        <div className={styles.footerActions}>
          <Button
            variant="secondary"
            size="lg"
            disabled={autopilot.isPending}
            title="Приму безопасные настройки по умолчанию и соберу колоду по подтверждённым фактам"
            onClick={() => void handleStartAutopilot()}
          >
            <Icon as={Wand2} size={14} />
            {autopilot.isPending ? 'Запускаю сборку…' : 'Сделай сам'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void handleContinue()}
          >
            Дальше
            <Icon as={ArrowRight} size={16} />
          </Button>
        </div>
      </footer>
    </div>
  )
}
