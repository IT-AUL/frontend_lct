import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './VariantsPage.module.css'

export function VariantsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Три варианта" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
