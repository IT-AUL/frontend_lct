import type { Schemas } from '@/shared/api'

export interface VariantAxes {
  text_density?: number | null
  layout_diversity?: number | null
  visualization?: number | null
}

export type VariantMetrics = Schemas['VariantMetrics'] & {
  style_fidelity?: number | null
}

export type VariantSummary = Omit<Schemas['VariantSummary'], 'metrics'> & {
  metrics?: VariantMetrics | null
  started_at?: string | null
  finished_at?: string | null
  stage?: string | null
  axes?: VariantAxes | null
}
export type VariantStatus = VariantSummary['status']
export type VariantAuditStatus = VariantSummary['audit_status']
export type SlideInfo = Schemas['SlideInfo']
export type ExportRecord = Schemas['ExportRecord']
export type ExportArtifact = Schemas['ExportArtifact']
export type VariantStrategy = Schemas['VariantRequest']['strategy']
export type CatalogStrategy = Exclude<VariantStrategy, 'custom'>
