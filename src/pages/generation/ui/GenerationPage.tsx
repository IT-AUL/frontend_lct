import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './GenerationPage.module.css'

export function GenerationPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Генерация" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
