import { ruleMeta, type RuleCategory } from '../model/rules'
import type { AuditIssue } from '../model/types'
import { canAutoFix, checkKind, groupByCategory, groupBySlide, isCriticalIssue, issueSignature, type IssueFilter } from './issues'
import type { JournalEntry } from './journal'

export type DisplayStatus = 'open' | 'selected' | 'fixed' | 'unresolved' | 'dismissed'

export interface IssueView {
  key: string
  issue: AuditIssue
  status: DisplayStatus
  note: JournalEntry | null
  selectable: boolean
}

export const PENDING_STATUSES: readonly DisplayStatus[] = ['open', 'selected', 'unresolved']

export function isPendingStatus(status: DisplayStatus): boolean {
  return PENDING_STATUSES.includes(status)
}

function latestBySignature(journal: readonly JournalEntry[]): Map<string, JournalEntry> {
  const latest = new Map<string, JournalEntry>()
  for (const entry of journal) {
    const previous = latest.get(entry.signature)
    if (!previous || previous.at < entry.at || (previous.at === entry.at && entry.outcome !== 'fixed')) latest.set(entry.signature, entry)
  }
  return latest
}

function currentView(issue: AuditIssue, latest: JournalEntry | undefined): IssueView {
  const base = { key: issue.id, issue, note: latest ?? null }
  if (issue.status === 'dismissed') return { ...base, status: 'dismissed', note: latest?.outcome === 'dismissed' ? latest : null, selectable: false }
  if (issue.status === 'fixed') return { ...base, status: 'fixed', selectable: false }
  if (issue.status === 'unresolved' || latest?.outcome === 'unresolved') return { ...base, status: 'unresolved', selectable: false }
  return { ...base, status: 'open', selectable: canAutoFix(issue) }
}

export function buildIssueViews(issues: readonly AuditIssue[], journal: readonly JournalEntry[]): IssueView[] {
  const latest = latestBySignature(journal)
  const current = issues.map((issue) => currentView(issue, latest.get(issueSignature(issue))))
  const reportedFixed = new Map<string, number>()
  for (const view of current) {
    if (view.status !== 'fixed') continue
    const signature = issueSignature(view.issue)
    reportedFixed.set(signature, (reportedFixed.get(signature) ?? 0) + 1)
  }
  const fixed: IssueView[] = []
  for (const entry of journal) {
    if (entry.outcome !== 'fixed') continue
    const reported = reportedFixed.get(entry.signature) ?? 0
    if (reported > 0) {
      reportedFixed.set(entry.signature, reported - 1)
      continue
    }
    fixed.push({ key: entry.id, issue: entry.issue, status: 'fixed', note: entry, selectable: false })
  }
  return [...current, ...fixed]
}

export function withSelection(views: readonly IssueView[], selectedIds: ReadonlySet<string>): IssueView[] {
  return views.map((view) => (view.selectable && selectedIds.has(view.issue.id) ? { ...view, status: 'selected' } : view))
}

export function selectableIds(views: readonly IssueView[]): string[] {
  return views.filter((view) => view.selectable).map((view) => view.issue.id)
}

export function pruneSelection(selected: ReadonlySet<string>, selectable: readonly string[]): Set<string> {
  const allowed = new Set(selectable)
  return new Set([...selected].filter((id) => allowed.has(id)))
}

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export interface IssueViewFilter extends IssueFilter {
  category: 'all' | RuleCategory
}

export const DEFAULT_VIEW_FILTER: IssueViewFilter = { kind: 'all', severity: 'all', status: 'open', fixableOnly: false, category: 'all' }

export function filterIssueViews(views: readonly IssueView[], filter: IssueViewFilter): IssueView[] {
  return views.filter(({ issue, status, selectable }) => {
    if (filter.kind !== 'all' && checkKind(issue) !== filter.kind) return false
    if (filter.severity !== 'all' && issue.severity !== filter.severity) return false
    if (filter.category !== 'all' && ruleMeta(issue.rule_code).category !== filter.category) return false
    if (filter.status === 'open' && !isPendingStatus(status)) return false
    if (filter.status === 'resolved' && isPendingStatus(status)) return false
    if (filter.fixableOnly && !selectable) return false
    return true
  })
}

export interface IssueViewGroup {
  key: string
  label: string
  views: IssueView[]
}

export type IssueGrouping = 'slide' | 'category'

export function groupIssueViews(
  views: readonly IssueView[],
  grouping: IssueGrouping,
  titleOf: (slideNumber: number) => string | undefined = () => undefined,
): IssueViewGroup[] {
  const byIssue = new Map(views.map((view) => [view.issue, view]))
  const issues = views.map((view) => view.issue)
  const groups = grouping === 'slide' ? groupBySlide(issues, titleOf) : groupByCategory(issues)
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    views: group.issues.map((issue) => byIssue.get(issue)).filter((view): view is IssueView => Boolean(view)),
  }))
}

export function countOpenCritical(views: readonly IssueView[]): number {
  return views.filter((view) => isPendingStatus(view.status) && isCriticalIssue(view.issue)).length
}

export function countByCategory(views: readonly IssueView[]): Record<RuleCategory, number> {
  const counts: Record<RuleCategory, number> = { brand: 0, layout: 0, text: 0, density: 0, integrity: 0, meaning: 0 }
  for (const view of views) {
    if (isPendingStatus(view.status)) counts[ruleMeta(view.issue.rule_code).category] += 1
  }
  return counts
}
