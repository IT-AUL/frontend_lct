import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useJobEvents } from '@/entities/assistant'
import { isTrackingId, useGenerationTracker, useJob, type DeckPlan, type GenerationPhase, type GenerationTracker } from '@/entities/generation'
import { markEvidence, projectRunId, rememberRun, useProject } from '@/entities/project'
import { useTemplate } from '@/entities/template'
import { CancelGenerationButton } from '@/features/cancel-generation'
import { readPlanRequest } from '@/features/edit-deck-plan'
import { useRerunGeneration } from '@/features/rerun-generation'
import {
  describeFailure,
  extractEventGenerationId,
  failureMeta,
  GenerationProgress,
  isTrackingLost,
  latestAssistantNote,
  RunNotice,
} from '@/widgets/generation-tracker'
import { routes } from '@/shared/config'
import { ArrowRight, Button, Icon, PageHeader, Sparkles } from '@/shared/ui'
import styles from './GenerationPage.module.css'

const VARIANT_WORD: Record<number, string> = { 1: 'один вариант', 2: 'два варианта', 3: 'три варианта' }
const AUTO_POLISH_DELAY_MS = 450

interface RunLocationState {
  fromStyle?: boolean
  fromAutopilot?: boolean
  strategies?: string[]
  deckPlan?: DeckPlan | null
  previewId?: string | null
}

function isRunLocationState(value: unknown): value is RunLocationState {
  return typeof value === 'object' && value !== null
}

function variantWord(count: number): string {
  return VARIANT_WORD[count] ?? `${count} вариантов`
}

function headline(phase: GenerationPhase, count: number): string {
  switch (phase) {
    case 'submitting':
    case 'running':
      return `Собираем ${variantWord(count)}`
    case 'completed':
      return count === 1 ? 'Вариант готов' : `${variantWord(count).replace(/^./, (letter) => letter.toUpperCase())} готовы`
    case 'failed':
      return 'Генерация не завершилась'
    case 'canceled':
      return 'Генерация отменена'
  }
}

function lead(phase: GenerationPhase, templateName: string | null): string {
  switch (phase) {
    case 'submitting':
    case 'running':
      return templateName ? `Шаблон «${templateName}». Можно уйти с экрана — сборка продолжится.` : 'Можно уйти с экрана — сборка продолжится.'
    case 'completed':
      return 'Выберите колоду, чтобы открыть её в аудите.'
    case 'failed':
      return 'Бриф и файлы сохранены.'
    case 'canceled':
      return 'Бриф и загруженные файлы сохранены.'
  }
}

function auditLink(projectId: string, runId: string, variantId: string, slideNumber?: number): string {
  const path = routes.audit(projectId, runId, variantId)
  return slideNumber ? `${path}?${new URLSearchParams({ slide: String(slideNumber) }).toString()}` : path
}

function RecoveryNotice({ projectId, runId, tracker }: { projectId: string; runId: string; tracker: GenerationTracker }) {
  const { rerun, isPending } = useRerunGeneration(projectId)
  const { phase, generationId, error } = tracker
  const { data: project } = useProject(projectId)

  if (isTrackingLost(error)) {
    const latest = projectRunId(project, projectId)
    const canOpenLatest = latest !== undefined && latest !== runId
    return (
      <RunNotice
        tone="neutral"
        title="Связь с запуском потеряна"
        message={
          <>
            Страница перезагрузилась до ответа сервиса.
            {canOpenLatest ? ' Откройте последний прогон или запустите сборку заново.' : ' Запустите сборку заново.'}
          </>
        }
        actions={
          <>
            {canOpenLatest && (
              <Link className={styles.primaryLink} to={routes.run(projectId, latest)}>
                Открыть последний прогон
              </Link>
            )}
            <Link className={canOpenLatest ? styles.secondaryLink : styles.primaryLink} to={routes.brief(projectId)}>
              Назад к брифу
            </Link>
          </>
        }
      />
    )
  }

  if (tracker.reconnecting && phase === 'running') {
    return (
      <RunNotice
        tone="info"
        title="Нет связи с сервисом — повторяем…"
        message="Сборка на сервере продолжается. Статус обновится сам, как только связь вернётся."
        actions={
          tracker.refetch && (
            <Button size="lg" onClick={tracker.refetch}>
              Проверить сейчас
            </Button>
          )
        }
      />
    )
  }

  if (phase !== 'failed' && phase !== 'canceled') return null

  const failure = phase === 'failed' ? describeFailure(tracker) : null
  const statusUnknown = !tracker.generation && Boolean(tracker.refetch)
  const retry = generationId ? (
    statusUnknown ? (
      <Button variant="primary" size="lg" onClick={tracker.refetch}>
        Повторить
      </Button>
    ) : (
      <Button variant="primary" size="lg" onClick={() => rerun(generationId)} disabled={isPending}>
        {isPending ? 'Запускаем…' : 'Повторить'}
      </Button>
    )
  ) : null

  return (
    <RunNotice
      tone={phase === 'failed' ? 'error' : 'neutral'}
      title={phase === 'failed' ? 'Вёрстка не завершилась' : 'Генерация отменена'}
      message={failure ? failure.message : 'Сборку можно запустить заново с теми же данными.'}
      meta={failure ? failureMeta(failure) : null}
      details={failure?.technical ? [failureMeta(failure), failure.technical].filter(Boolean).join('\n') : null}
      actions={
        <>
          {retry}
          <Link className={retry ? styles.secondaryLink : styles.primaryLink} to={routes.brief(projectId)}>
            Назад к брифу
          </Link>
        </>
      }
    />
  )
}

export function GenerationPage() {
  const { projectId = '', runId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const routeState = isRunLocationState(location.state) ? location.state : null

  const isJobRun = runId.startsWith('job_')
  const autopilotJobQuery = useJob(isJobRun ? runId : null)
  const autopilotJob = autopilotJobQuery.data
  const jobIdForEvents = isJobRun ? runId : null
  const preEvents = useJobEvents(jobIdForEvents)

  const resolvedRunIdFromJob =
    (typeof autopilotJob?.result_ids?.generation_id === 'string' ? autopilotJob.result_ids.generation_id : null) ??
    extractEventGenerationId(preEvents.events)

  const trackerTargetId = isJobRun ? resolvedRunIdFromJob : runId
  const tracker = useGenerationTracker(trackerTargetId)

  const activeJobId = isJobRun ? runId : tracker.jobId
  const jobEvents = useJobEvents(activeJobId)

  const phase: GenerationPhase =
    isJobRun && !resolvedRunIdFromJob
      ? autopilotJob?.state === 'failed'
        ? 'failed'
        : autopilotJob?.state === 'canceled'
          ? 'canceled'
          : 'running'
      : tracker.phase

  const generationId = tracker.generationId ?? resolvedRunIdFromJob
  const canCancel = tracker.canCancel
  const tracking = isTrackingId(runId)

  const requestedStrategies = routeState?.strategies
  const variantCount =
    tracker.generation?.variants.length ||
    tracker.variantIds.length ||
    requestedStrategies?.length ||
    (isJobRun ? 1 : 3)

  const lost = !isJobRun && isTrackingLost(tracker.error)
  const { data: template } = useTemplate(tracker.generation?.template_id)

  const storedPlan = useMemo(() => readPlanRequest(projectId), [projectId])
  const deckPlan: DeckPlan | null =
    tracker.generation?.deck_plan ??
    routeState?.deckPlan ??
    storedPlan?.result.proposals[0]?.deckPlan ??
    null

  const assistantNote = useMemo(
    () => latestAssistantNote(jobEvents.events, null, deckPlan?.slides.length),
    [jobEvents.events, deckPlan?.slides.length],
  )

  useEffect(() => {
    if ((!tracking && !isJobRun) || !generationId) return
    rememberRun(projectId, generationId)
    navigate(routes.run(projectId, generationId), { replace: true, state: location.state })
  }, [tracking, isJobRun, generationId, projectId, navigate, location.state])

  useEffect(() => {
    if (phase === 'completed') markEvidence(projectId, 'generated')
  }, [phase, projectId])

  const shouldAutoPolish = Boolean(
    routeState?.fromStyle ||
      routeState?.fromAutopilot ||
      isJobRun ||
      jobEvents.done ||
      jobEvents.events.some((event) => event.type === 'slide.ready' || event.type === 'stage.started') ||
      tracker.generation?.variants.length === 1,
  )

  useEffect(() => {
    if (phase !== 'completed' || !generationId || !shouldAutoPolish) return
    const timer = setTimeout(() => {
      navigate(routes.polish(projectId, generationId))
    }, AUTO_POLISH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [phase, generationId, shouldAutoPolish, navigate, projectId])

  const effectiveTracker: GenerationTracker = useMemo(
    () => (isJobRun && !resolvedRunIdFromJob ? { ...tracker, phase, jobId: runId } : tracker),
    [isJobRun, resolvedRunIdFromJob, tracker, phase, runId],
  )

  const actions =
    phase === 'submitting' && !generationId ? (
      <CancelGenerationButton generationId={null} />
    ) : phase === 'running' && canCancel && generationId ? (
      <CancelGenerationButton generationId={generationId} onCanceled={() => navigate(routes.brief(projectId))} />
    ) : phase === 'completed' && generationId ? (
      <>
        <Link className={styles.secondaryLink} to={routes.variants(projectId, generationId)}>
          Сравнить по слайдам
          <Icon as={ArrowRight} />
        </Link>
        <Link className={styles.primaryLink} to={routes.polish(projectId, generationId)}>
          Перейти к доводке
          <Icon as={ArrowRight} />
        </Link>
      </>
    ) : undefined

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Сборка"
        title={lost ? 'Статус запуска неизвестен' : headline(phase, variantCount)}
        description={lost ? 'Бриф и загруженные файлы сохранены.' : lead(phase, template?.filename ?? null)}
        actions={actions}
      />
      {assistantNote && !lost && (
        <div className={styles.assistantStrip} role="status" aria-live="polite" data-testid="assistant-note">
          <p className={styles.assistantNote}>
            <Icon as={Sparkles} size={15} />
            <span key={assistantNote} className={styles.noteText}>
              {assistantNote}
            </span>
          </p>
        </div>
      )}
      <RecoveryNotice projectId={projectId} runId={runId} tracker={effectiveTracker} />
      {!lost && (
        <GenerationProgress
          tracker={effectiveTracker}
          events={jobEvents.events}
          deckPlan={deckPlan}
          requestedStrategies={requestedStrategies}
          auditHref={generationId ? (variantId, slideNumber) => auditLink(projectId, generationId, variantId, slideNumber) : undefined}
        />
      )}
    </div>
  )
}
