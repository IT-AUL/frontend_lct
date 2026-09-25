export { auditIssuesQuery, auditKeys, useAuditIssues, useContextualAudit, useDismissIssue, useRepairIssues, useVariantAudit } from './api/auditApi'
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
export { boxStyle, clampBox, MIN_BOX_SIZE } from './lib/bbox'
export type { OverlayBox } from './lib/bbox'
export { diffRepair, dismissalEntry, journalActionText, plannedFix, summarizeJournal } from './lib/journal'
export type { JournalEntry, JournalOutcome, RepairBatch } from './lib/journal'
export { actionLabel, describeMeasurement } from './lib/measurement'
export type { MeasurementView } from './lib/measurement'
export {
  buildIssueViews,
  countByCategory,
  countOpenCritical,
  DEFAULT_VIEW_FILTER,
  filterIssueViews,
  groupIssueViews,
  isPendingStatus,
  pruneSelection,
  selectableIds,
  toggleSelection,
  withSelection,
} from './lib/views'
export type { DisplayStatus, IssueGrouping, IssueView, IssueViewFilter, IssueViewGroup } from './lib/views'
export { CATEGORY_LABEL, CATEGORY_ORDER, isAutoFixable, ruleMeta, RULES } from './model/rules'
export type { RuleCategory } from './model/rules'
export { CRITICAL_SEVERITIES, SEVERITY, SEVERITY_ORDER } from './model/severity'
export type { AuditIssue, AuditRun, CheckKind, IssueStatus, Severity } from './model/types'
export { CheckKindBadge } from './ui/CheckKindBadge'
export { SeverityBadge } from './ui/SeverityBadge'
