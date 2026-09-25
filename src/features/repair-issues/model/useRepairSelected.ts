import { useQueryClient } from '@tanstack/react-query'
import { auditKeys, diffRepair, useRepairIssues, type AuditIssue, type JournalEntry, type RepairBatch } from '@/entities/audit'
import { markEvidence } from '@/entities/project'
import { useActiveProviderSession } from '@/entities/provider-session'

export interface RepairResult {
  batch: RepairBatch
  entries: JournalEntry[]
  reaudit: AuditIssue[]
}

interface RepairParams {
  projectId: string
  variantId: string
  auditId: string | undefined
  fromRevision: number
  reloadIssues: () => Promise<AuditIssue[] | undefined>
}

export function useRepairSelected({ projectId, variantId, auditId, fromRevision, reloadIssues }: RepairParams) {
  const queryClient = useQueryClient()
  const session = useActiveProviderSession()
  const mutation = useRepairIssues(variantId)

  const run = async (selected: readonly AuditIssue[]): Promise<RepairResult> => {
    if (!auditId) throw new Error('Аудит ещё не загружен')
    const snapshot = [...selected]
    const outcome = await mutation.mutateAsync({ auditId, issueIds: snapshot.map((issue) => issue.id), providerSessionId: session?.id })
    const reaudit = queryClient.getQueryData<AuditIssue[]>(auditKeys.issues(outcome.auditId)) ?? (await reloadIssues()) ?? []
    const at = new Date().toISOString()
    const entries = diffRepair(snapshot, reaudit, outcome.deckRevision, at)
    const fixed = entries.filter((entry) => entry.outcome === 'fixed').length
    markEvidence(projectId, 'repaired')
    return {
      entries,
      reaudit,
      batch: {
        id: `r${outcome.deckRevision}:${at}`,
        fromRevision,
        revision: outcome.deckRevision,
        requested: snapshot.length,
        fixed,
        unresolved: entries.length - fixed,
        serviceCounts: outcome.counts,
        at,
      },
    }
  }

  return { run, isPending: mutation.isPending }
}
