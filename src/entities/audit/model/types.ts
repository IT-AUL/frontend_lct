import type { Schemas } from '@/shared/api'

export type AuditIssue = Schemas['AuditIssue']
export type AuditRun = Schemas['AuditRun']
export type Severity = AuditIssue['severity']
export type IssueStatus = AuditIssue['status']
export type CheckKind = 'D' | 'N'
