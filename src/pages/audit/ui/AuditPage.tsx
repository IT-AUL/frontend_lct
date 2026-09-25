import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './AuditPage.module.css'

export function AuditPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Аудит и правки" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
