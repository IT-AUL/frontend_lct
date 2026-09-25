import { useQuery } from '@tanstack/react-query'
import { requestOptionalJson } from '@/shared/api'
import { applyRuleCatalog, parseRuleCatalog, type RuleCatalogEntry } from '../model/rules'

let pending: Promise<RuleCatalogEntry[] | null> | null = null

export function loadRuleCatalog(): Promise<RuleCatalogEntry[] | null> {
  pending ??= requestOptionalJson<unknown>('/audit/rules')
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
