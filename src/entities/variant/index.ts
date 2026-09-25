export { useVariant, useVariants, useVariantSlides, variantKeys } from './api/variantApi'
export { resolveDeckFiles } from './lib/artifacts'
export type { DeckFile, DeckFileFormat, DeckFiles } from './lib/artifacts'
export { AUDIT_STATUS_LABEL, PEI_MAX, variantMetrics } from './lib/metrics'
export type { VariantMetricsView } from './lib/metrics'
export { isVariantSettled } from './model/status'
export {
  DEFAULT_STRATEGY,
  orderVariants,
  STRATEGIES,
  STRATEGY_AXIS,
  STRATEGY_ORDER,
  STRATEGY_PROFILE_LABEL,
  strategyInfo,
  variantRationale,
} from './model/strategies'
export type { ProfileLevel, StrategyInfo, StrategyProfile } from './model/strategies'
export type {
  CatalogStrategy,
  ExportArtifact,
  ExportRecord,
  SlideInfo,
  VariantAuditStatus,
  VariantMetrics,
  VariantStatus,
  VariantStrategy,
  VariantSummary,
} from './model/types'
