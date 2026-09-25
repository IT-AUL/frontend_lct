import type { BudgetStatus } from '@/entities/generation'
import { formatClock } from '@/shared/lib/format'

export type BudgetTone = 'normal' | 'warn' | 'exceeded'

export interface BudgetTick {
  seconds: number
  label: string
}

const WARN_FRACTION = 0.8

export function budgetTicks(budgetSeconds: number, stepSeconds = 60): BudgetTick[] {
  const ticks: BudgetTick[] = []
  const safeStep = stepSeconds > 0 ? stepSeconds : budgetSeconds
  for (let seconds = 0; seconds < budgetSeconds; seconds += safeStep) ticks.push({ seconds, label: formatClock(seconds) })
  ticks.push({ seconds: budgetSeconds, label: `лимит ТЗ ${formatClock(budgetSeconds)}` })
  return ticks
}

export function budgetTone(status: BudgetStatus): BudgetTone {
  if (status.exceeded) return 'exceeded'
  return status.fraction >= WARN_FRACTION ? 'warn' : 'normal'
}

export function budgetVerdict(elapsed: number, status: BudgetStatus, finished: boolean): string {
  const limit = formatClock(status.budgetSeconds)
  if (status.exceeded) return `Бюджет ${limit} превышен на ${formatClock(elapsed - status.budgetSeconds)}`
  if (finished) return `В пределах бюджета ${limit}: запас ${formatClock(status.remainingSeconds)}`
  return `До лимита ${limit} осталось ${formatClock(status.remainingSeconds)}`
}
