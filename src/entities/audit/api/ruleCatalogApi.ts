import { useQuery } from '@tanstack/react-query'
import { api, isUnsupportedEndpoint, unwrap } from '@/shared/api'
import { applyRuleCatalog, parseRuleCatalog, type RuleCatalogEntry } from '../model/rules'

let pending: Promise<RuleCatalogEntry[] | null> | null = null

export function loadRuleCatalog(): Promise<RuleCatalogEntry[] | null> {
  pending ??= unwrap(api.GET('/api/v1/audit/rules'))
    .catch((error: unknown) => {
      if (isUnsupportedEndpoint(error)) return null
      throw error
    })
    .then((payload) => {
      const entries = payload === null ? null : parseRuleCatalog(payload)
      applyRuleCatalog(entries)
      return entries
    })
    .catch(() => {
      pending = null
      return null
    })
  return pending
}

export function resetRuleCatalog(): void {
  pending = null
  applyRuleCatalog(null)
}

export function useRuleCatalog() {
  return useQuery({
    queryKey: ['audit', 'rules'] as const,
    queryFn: loadRuleCatalog,
    staleTime: Infinity,
  })
}
