export {
  availableQuickActions,
  buildPlanView,
  CHART_TYPE_LABEL,
  chartTypeLabel,
  deckPurposeLabel,
  EDITOR_VISUALS,
  formatSlideRange,
  ORIGIN_LABEL,
  parseEvidenceRef,
  parseSlideChartView,
  plannedVisual,
  resolveDeckKeyMessage,
  slideIdea,
  slideSources,
  VISUAL_LABEL,
} from './lib/plan'
export type { EvidenceRef, PlanRow, PlanSectionSummary, PlanStats, PlanView, QuickActionKind, SlideChartOption, SlideChartView, SlideSource } from './lib/plan'
export { ChartReasoningBox } from './ui/ChartReasoningBox'
export { DeckPlanView } from './ui/DeckPlanView'
export type { PlanEditor } from './ui/DeckPlanView'
export { KeyMessageBanner } from './ui/KeyMessageBanner'
