import { Navigate, useParams } from 'react-router'
import { routes } from '@/shared/config'

export function QuestionsPage() {
  const { projectId = '' } = useParams()
  return <Navigate to={routes.brief(projectId)} replace />
}
