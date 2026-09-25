import { clsx } from 'clsx'
import { useId } from 'react'
import type { PipelineView } from '../lib/pipeline'
import styles from './PipelineStages.module.css'

const STATE_LABEL = {
  idle: '',
  pending: 'ждёт',
  active: 'идёт',
  done: 'готово',
  error: 'ошибка',
} as const

function statusLine(view: PipelineView): string {
  switch (view.mode) {
    case 'finished':
      return 'Все этапы пройдены'
    case 'tracked':
      return `Сейчас: ${view.currentLabel?.toLowerCase() ?? 'этап не указан'}`
    case 'stopped':
      return view.currentLabel ? `Остановлено на этапе «${view.currentLabel.toLowerCase()}»` : 'Остановлено'
    case 'opaque':
      return view.currentLabel ? `Сейчас: ${view.currentLabel.toLowerCase()}` : 'Конвейер в работе'
  }
}

export function PipelineStages({ view }: { view: PipelineView }) {
  const titleId = useId()
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          Конвейер каждого варианта
        </h2>
        <span className={clsx(styles.status, view.mode === 'opaque' && styles.busy)} aria-live="polite">
          {view.mode === 'opaque' && <span className={styles.pulse} aria-hidden />}
          {statusLine(view)}
        </span>
      </div>
      <ol className={styles.steps}>
        {view.steps.map((step, index) => (
          <li key={step.stage} className={clsx(styles.step, styles[step.state])}>
            <span className={styles.number} aria-hidden>
              {step.state === 'done' ? '✓' : index + 1}
            </span>
            <span className={styles.label}>{step.label}</span>
            {STATE_LABEL[step.state] && <span className={styles.srOnly}>{`, ${STATE_LABEL[step.state]}`}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}
