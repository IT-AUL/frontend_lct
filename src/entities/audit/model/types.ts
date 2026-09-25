import type { Schemas } from '@/shared/api'

export interface FixPreview {
  action?: string | null
  description_ru?: string | null
  params?: Record<string, unknown> | null
}

export type AuditIssue = Schemas['AuditIssue'] & {
  fingerprint?: string | null
  fix_preview?: string | FixPreview | null
}
export type AuditRun = Schemas['AuditRun']
export type Severity = AuditIssue['severity']
export type IssueStatus = AuditIssue['status']
export type CheckKind = 'D' | 'N'

export type RepairIssueStatus = 'fixed' | 'failed' | 'skipped'

export interface RepairIssueOutcome {
  issueId: string
  status: RepairIssueStatus
  action: string | null
  summary: string | null
  reason: string | null
}
