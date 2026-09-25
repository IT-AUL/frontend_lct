import type { GenerationTracker } from '@/entities/generation'
import type { RunStatus } from '@/widgets/app-header'
import { isTrackingLost } from '@/widgets/generation-tracker'
import type { ProjectProgress } from '@/widgets/project-rail'
import type { ProjectStep } from '@/shared/config'
import { pluralize } from '@/shared/lib/format'

function readyLabel(count: number | undefined): string {
  return count ? `Готово · ${count} ${pluralize(count, ['вариант', 'варианта', 'вариантов'])}` : 'Готово'
}

export function runStatus(step: ProjectStep | undefined, progress: ProjectProgress, tracker: Pick<GenerationTracker, 'phase' | 'generation' | 'error'>): RunStatus | undefined {
  if (step === 'template') {
    return progress.hasTemplate ? { label: 'Шаблон разобран', tone: 'ok' } : { label: 'Нужен шаблон', tone: 'neutral' }
  }
  if (step === 'brief') {
    return progress.hasContent ? { label: 'Контент загружен', tone: 'ok' } : { label: 'Черновик брифа', tone: 'neutral' }
  }
  if (!step) return undefined
  const { phase, generation, error } = tracker
  if (isTrackingLost(error)) return { label: 'Статус запуска неизвестен', tone: 'neutral' }
  if (phase === 'failed') return { label: 'Ошибка генерации', tone: 'error' }
  if (phase === 'canceled') return { label: 'Генерация отменена', tone: 'neutral' }
  if (generation?.state === 'awaiting_user') return { label: 'Ждёт решения', tone: 'warn' }
  if (phase === 'submitting' || (phase === 'running' && (generation || !progress.generated))) {
    return { label: 'Идёт генерация', tone: 'info' }
  }
  if (progress.reaudited) return { label: 'Повторный аудит пройден', tone: 'ok' }
  return { label: readyLabel(generation?.variants.length), tone: 'ok' }
}
