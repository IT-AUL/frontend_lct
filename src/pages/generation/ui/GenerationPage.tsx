import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CancelGenerationButton } from '@/features/cancel-generation'
import { useRerunGeneration } from '@/features/rerun-generation'
import { describeFailure, failureMeta, GenerationProgress, isTrackingLost, RunNotice } from '@/widgets/generation-tracker'
import { isTrackingId, useGenerationTracker, type GenerationPhase, type GenerationTracker } from '@/entities/generation'
import { latestRunId, markEvidence, rememberRun } from '@/entities/project'
import { routes } from '@/shared/config'
import { Button, PageHeader } from '@/shared/ui'
import styles from './GenerationPage.module.css'

const VARIANT_WORD: Record<number, string> = { 1: 'один вариант', 2: 'два варианта', 3: 'три варианта' }

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

function lead(phase: GenerationPhase): string {
  switch (phase) {
    case 'submitting':
      return 'Сервис ответит, когда соберёт все варианты. Можно перейти на другой экран — прогон продолжится; не перезагружайте вкладку до ответа.'
    case 'running':
      return 'Можно уйти со страницы — прогон продолжится, результат сохранится в проекте.'
    case 'completed':
      return 'Варианты собраны по правилам шаблона и проверены аудитом внутри конвейера.'
    case 'failed':
      return 'Бриф и загруженные файлы сохранены — можно повторить запуск или вернуться к брифу.'
    case 'canceled':
      return 'Бриф и загруженные файлы сохранены.'
  }
}

function RecoveryNotice({ projectId, runId, tracker }: { projectId: string; runId: string; tracker: GenerationTracker }) {
  const { rerun, isPending } = useRerunGeneration(projectId)
  const { phase, generationId, error } = tracker

  if (isTrackingLost(error)) {
    const latest = latestRunId(projectId)
    const canOpenLatest = latest !== undefined && latest !== runId
    return (
      <RunNotice
        tone="neutral"
        title="Связь с запуском потеряна"
        message={
          <>
            {error?.message}. Сервис мог закончить генерацию, но её номер не успел прийти в браузер.
            {canOpenLatest ? ' Откройте последний сохранённый прогон проекта или запустите генерацию заново из брифа.' : ' Запустите генерацию заново из брифа.'}
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

  if (phase !== 'failed' && phase !== 'canceled') return null

  const failure = phase === 'failed' ? describeFailure(tracker) : null
  const retry = generationId ? (
    <Button variant="primary" size="lg" onClick={() => rerun(generationId)} disabled={isPending}>
      {isPending ? 'Запускаем…' : 'Повторить'}
    </Button>
  ) : null

  return (
    <RunNotice
      tone={phase === 'failed' ? 'error' : 'neutral'}
      title={phase === 'failed' ? 'Вёрстка не завершилась' : 'Генерация отменена'}
      message={failure ? failure.message : 'Прогон остановлен по вашему запросу. Его можно запустить заново с теми же данными.'}
      meta={failure ? failureMeta(failure) : null}
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
  const navigate = useNavigate()
  const tracker = useGenerationTracker(runId)
  const { phase, generationId, canCancel } = tracker
  const tracking = isTrackingId(runId)
  const variantCount = tracker.generation?.variants.length || tracker.variantIds.length || 3

  useEffect(() => {
    if (!tracking || !generationId) return
    rememberRun(projectId, generationId)
    navigate(routes.run(projectId, generationId), { replace: true })
  }, [tracking, generationId, projectId, navigate])

  useEffect(() => {
    if (phase === 'completed') markEvidence(projectId, 'generated')
  }, [phase, projectId])

  const actions =
    phase === 'running' && canCancel && generationId ? (
      <CancelGenerationButton generationId={generationId} onCanceled={() => navigate(routes.brief(projectId))} />
    ) : phase === 'completed' && generationId ? (
      <>
        <Link className={styles.secondaryLink} to={routes.plan(projectId, generationId)}>
          План колоды
        </Link>
        <Link className={styles.primaryLink} to={routes.variants(projectId, generationId)}>
          Сравнить варианты →
        </Link>
      </>
    ) : undefined

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Шаг 4 · Генерация" title={headline(phase, variantCount)} description={lead(phase)} actions={actions} />
      <RecoveryNotice projectId={projectId} runId={runId} tracker={tracker} />
      {!isTrackingLost(tracker.error) && <GenerationProgress tracker={tracker} />}
    </div>
  )
}
