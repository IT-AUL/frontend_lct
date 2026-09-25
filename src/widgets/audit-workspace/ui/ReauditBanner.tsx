import { Link } from 'react-router'
import styles from './ReauditBanner.module.css'

interface ReauditBannerProps {
  revision: number
  openCritical: number
  stats: { fixed: number; dismissed: number; failed: number }
  exportHref: string
  onClose: () => void
}

export function ReauditBanner({ revision, openCritical, stats, exportHref, onClose }: ReauditBannerProps) {
  if (openCritical === 0) {
    return (
      <div role="status" className={styles.success}>
        <span className={styles.check} aria-hidden>
          ✓
        </span>
        <div className={styles.text}>
          <div className={styles.successTitle}>Повторный аудит: 0 критических проблем</div>
          <div className={styles.detail}>
            Ревизия r{revision} · исправлено {stats.fixed}, отклонено с причиной {stats.dismissed}, не удалось {stats.failed} — раскрыто в журнале и
            паспорте.
          </div>
        </div>
        <Link to={exportHref} className={styles.primary}>
          Скачать PPTX и паспорт →
        </Link>
      </div>
    )
  }
  return (
    <div role="status" className={styles.partial}>
      <div className={styles.partialTitle}>Повторный аудит: осталось {openCritical} критических</div>
      <div className={styles.detail}>Исправьте или отклоните их — иначе это попадёт в паспорт.</div>
      <div className={styles.spacer} />
      <button type="button" className={styles.close} onClick={onClose}>
        Понятно
      </button>
    </div>
  )
}
