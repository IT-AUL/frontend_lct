import { Navigate, useParams } from 'react-router'
import { routes } from '@/shared/config'

export function StylePage() {
  const { projectId = '' } = useParams()
  return <Navigate to={routes.planDraft(projectId)} replace />
}
