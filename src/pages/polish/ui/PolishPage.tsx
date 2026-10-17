import { Navigate, useParams } from 'react-router'
import { routes } from '@/shared/config'

export function PolishPage() {
  const { projectId = '', runId = '', variantId } = useParams()
  return <Navigate to={routes.audit(projectId, runId, variantId)} replace />
}
