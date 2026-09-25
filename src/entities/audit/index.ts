export { auditKeys, useAuditIssues, useContextualAudit, useDismissIssue, useRepairIssues, useVariantAudit } from './api/auditApi'
export type { RepairOutcome } from './api/auditApi'
export {
  canAutoFix,
  checkKind,
  countBySeverity,
  DEFAULT_ISSUE_FILTER,
  filterIssues,
  formatMeasurement,
  groupByCategory,
  groupBySlide,
  isCriticalIssue,
  isOpenIssue,
  issueSignature,
  slideNumber,
  sortIssues,
} from './lib/issues'
export type { IssueFilter, IssueGroup } from './lib/issues'
export { CATEGORY_LABEL, isAutoFixable, ruleMeta, RULES } from './model/rules'
export type { RuleCategory } from './model/rules'
export { CRITICAL_SEVERITIES, SEVERITY, SEVERITY_ORDER } from './model/severity'
export type { AuditIssue, AuditRun, CheckKind, IssueStatus, Severity } from './model/types'
export { CheckKindBadge } from './ui/CheckKindBadge'
export { SeverityBadge } from './ui/SeverityBadge'
