import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './TemplatePage.module.css'

export function TemplatePage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Шаблон" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
