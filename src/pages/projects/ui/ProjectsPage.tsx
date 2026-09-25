import { EmptyState, PageHeader } from '@/shared/ui'
import styles from './ProjectsPage.module.css'

export function ProjectsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Проекты" />
      <EmptyState title="Экран в разработке" />
    </div>
  )
}
