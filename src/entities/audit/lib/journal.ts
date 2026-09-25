import { ruleMeta } from '../model/rules'
import type { AuditIssue } from '../model/types'
import { isOpenIssue, issueSignature } from './issues'
import { actionLabel } from './measurement'

export type JournalOutcome = 'fixed' | 'unresolved' | 'dismissed'

export interface JournalEntry {
  id: string
  outcome: JournalOutcome
  signature: string
  revision: number
  issue: AuditIssue
  reason: string | null
  at: string
}

export interface RepairBatch {
  id: string
  fromRevision: number
  revision: number
  requested: number
  fixed: number
  unresolved: number
  serviceCounts: Record<string, number> | null
  at: string
}

function isStillPresent(issue: AuditIssue): boolean {
  return isOpenIssue(issue) || issue.status === 'unresolved'
}

export function diffRepair(
  snapshot: readonly AuditIssue[],
  reaudit: readonly AuditIssue[],
  revision: number,
  at: string = new Date().toISOString(),
): JournalEntry[] {
  const remaining = new Map<string, number>()
  for (const issue of reaudit) {
    if (!isStillPresent(issue)) continue
    const signature = issueSignature(issue)
    remaining.set(signature, (remaining.get(signature) ?? 0) + 1)
  }
  return snapshot.map((issue, index) => {
    const signature = issueSignature(issue)
    const left = remaining.get(signature) ?? 0
    if (left > 0) remaining.set(signature, left - 1)
    return {
      id: `r${revision}:${index}:${signature}`,
      outcome: left > 0 ? 'unresolved' : 'fixed',
      signature,
      revision,
      issue,
      reason: null,
      at,
    }
  })
}

export function dismissalEntry(issue: AuditIssue, reason: string, revision: number, at: string = new Date().toISOString()): JournalEntry {
  const signature = issueSignature(issue)
  return { id: `d${revision}:${issue.id}:${at}`, outcome: 'dismissed', signature, revision, issue, reason, at }
}

export function summarizeJournal(entries: readonly JournalEntry[]): Record<JournalOutcome, number> {
  const latest = new Map<string, JournalEntry>()
  for (const entry of entries) {
    const key = entry.outcome === 'fixed' ? entry.id : entry.signature
    latest.set(key, entry)
  }
  const counts: Record<JournalOutcome, number> = { fixed: 0, unresolved: 0, dismissed: 0 }
  for (const entry of latest.values()) counts[entry.outcome] += 1
  return counts
}

export function plannedFix(issue: Pick<AuditIssue, 'rule_code' | 'proposed_actions'>): string | null {
  const autoFix = ruleMeta(issue.rule_code).autoFix
  if (autoFix) return autoFix
  const actions = issue.proposed_actions ?? []
  if (actions.length === 0) return null
  const text = actions.map(actionLabel).join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function journalActionText(entry: Pick<JournalEntry, 'outcome' | 'issue' | 'reason'>): string {
  if (entry.outcome === 'dismissed') return `Отклонено: ${entry.reason ?? 'причина сохранена в сервисе'}`
  if (entry.outcome === 'unresolved') return 'Не удалось исправить: проблема осталась в новой ревизии'
  return plannedFix(entry.issue) ?? 'Исправлено'
}
