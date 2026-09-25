import { plannedFix, ruleMeta, slideNumber } from '@/entities/audit'
import type { RepairPreview } from '../model/useRepairPreview'
import styles from './RepairBar.module.css'

const STATUS_MARK = { fixed: '✓', failed: '×', skipped: '—' } as const

export function RepairPreviewList({ preview, onClose }: { preview: RepairPreview; onClose: () => void }) {
  const ready = preview.items.filter((item) => item.outcome?.status === 'fixed').length
  return (
    <section className={styles.preview} aria-label="Что будет сделано">
      <header className={styles.previewHead}>
        <span>
          Что будет сделано · исправится {ready} из {preview.items.length}
        </span>
        <button type="button" className={styles.previewClose} onClick={onClose} aria-label="Скрыть план исправлений">
          ✕
        </button>
      </header>
      <ul className={styles.previewList}>
        {preview.items.map(({ issue, outcome }) => {
          const number = slideNumber(issue)
          const status = outcome?.status ?? null
          const text = outcome
            ? outcome.status === 'fixed'
              ? (outcome.summary ?? plannedFix(issue) ?? 'Будет исправлено')
              : (outcome.reason ?? (outcome.status === 'skipped' ? 'Сервис пропустит эту проблему' : 'Исправить не получится'))
            : 'Сервис не описал действие для этой проблемы'
          return (
            <li key={issue.id} className={styles.previewItem} data-status={status ?? 'unknown'}>
              <span className={styles.previewMark} aria-hidden>
                {status ? STATUS_MARK[status] : '?'}
              </span>
              <span className={styles.previewText}>
                <span>{text}</span>
                <span className={styles.previewMeta}>
                  {ruleMeta(issue.rule_code).name} · {number ? `сл. ${String(number).padStart(2, '0')}` : 'колода'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
