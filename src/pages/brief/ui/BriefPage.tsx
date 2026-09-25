import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './BriefPage.module.css'

export function BriefPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Бриф и контент" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
