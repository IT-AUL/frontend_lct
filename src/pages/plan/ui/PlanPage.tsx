import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './PlanPage.module.css'

export function PlanPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="План колоды" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
