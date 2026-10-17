import { Navigate, useParams } from 'react-router'
import { routes } from '@/shared/config'

export function IntakePage() {
  const { projectId = '' } = useParams()
  return <Navigate to={routes.template(projectId)} replace />
}
