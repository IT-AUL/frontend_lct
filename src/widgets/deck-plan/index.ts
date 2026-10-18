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
  slideSourceKinds,
  slideSources,
  SOURCE_KIND_LABEL,
  VISUAL_LABEL,
} from './lib/plan'
export type { EvidenceRef, PlanRow, PlanSectionSummary, PlanStats, PlanView, QuickActionKind, SlideChartOption, SlideChartView, SlideSource, SourceKind } from './lib/plan'
export { ChartMiniSvg, ChartReasoningBox } from './ui/ChartReasoningBox'
export { PlanCard } from './ui/PlanCard'
export { DeckPlanView } from './ui/DeckPlanView'
export type { PlanEditor } from './ui/DeckPlanView'
export { KeyMessageBanner } from './ui/KeyMessageBanner'
