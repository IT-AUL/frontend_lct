import { clsx } from 'clsx'
import { budgetStatus, elapsedSeconds } from '@/entities/generation'
import { GENERATION_BUDGET_SECONDS } from '@/shared/config'
import { formatClock, formatSeconds } from '@/shared/lib/format'
import { useNow } from '@/shared/lib/time'
import { Meter } from '@/shared/ui'
import { budgetTicks, budgetTone, budgetVerdict } from '../lib/timer'
import styles from './BudgetTimer.module.css'

interface BudgetTimerProps {
  startedAt: number | null
  finishedAt: number | null
  ticking: boolean
}

const TICK_MS = 250

const TONE_COLOR = {
  normal: 'var(--ink)',
  warn: 'var(--warn)',
  exceeded: 'var(--error)',
} as const

export function BudgetTimer({ startedAt, finishedAt, ticking }: BudgetTimerProps) {
  const live = ticking && finishedAt === null && startedAt !== null
  const now = useNow(TICK_MS, live)
  const elapsed = elapsedSeconds({ startedAt, finishedAt }, now)
  const status = budgetStatus(elapsed, GENERATION_BUDGET_SECONDS)
  const tone = budgetTone(status)
  const finished = finishedAt !== null

  return (
    <section className={styles.root} aria-label="Время генерации против бюджета">
      <div className={styles.clock}>
        <div className={styles.caption}>{finished ? 'Заняло' : 'Прошло'}</div>
        <div className={styles.value}>
          <span role="timer" className={clsx(styles.elapsed, styles[tone])}>
            {formatClock(elapsed)}
          </span>
          <span className={styles.budget}>/ {formatClock(GENERATION_BUDGET_SECONDS)}</span>
        </div>
        {finished && <div className={styles.exact}>{formatSeconds(elapsed)} по данным сервиса</div>}
      </div>
      <div className={styles.scale}>
        <Meter value={status.fraction} height={10} color={TONE_COLOR[tone]} label={`Прошло ${formatClock(elapsed)} из ${formatClock(GENERATION_BUDGET_SECONDS)}`} />
        <div className={styles.ticks} aria-hidden>
          {budgetTicks(GENERATION_BUDGET_SECONDS).map((tick) => (
            <span key={tick.seconds}>{tick.label}</span>
          ))}
        </div>
        <div className={clsx(styles.verdict, styles[tone])}>{budgetVerdict(elapsed, status, finished)}</div>
        <div className={styles.note}>Шкала показывает время, а не готовность: сервис сообщает статус каждого варианта, но не процент.</div>
      </div>
    </section>
  )
}
