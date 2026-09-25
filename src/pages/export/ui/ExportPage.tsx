import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './ExportPage.module.css'

export function ExportPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Экспорт" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
