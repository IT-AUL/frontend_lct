import type { ExportFormat, QualityPassport } from '@/entities/passport'
import { isCapabilityAvailable, type Capabilities } from '@/entities/system'
import { DEFAULT_STRATEGY, orderVariants, type DeckFile, type VariantSummary } from '@/entities/variant'

const HTML_CAPABILITY_PATHS = ['export_formats.html', 'exports.html', 'formats.html', 'export.html', 'html_export'] as const

const EXTENSION: Record<ExportFormat, string> = {
  pptx: 'pptx',
  pdf: 'pdf',
  html: 'html',
  quality_passport: 'json',
}

export function pickVariantId(variants: readonly VariantSummary[], requested: string | undefined): string | null {
  if (requested && variants.some((variant) => variant.id === requested)) return requested
  const ordered = orderVariants(variants)
  return ordered.find((variant) => variant.strategy === DEFAULT_STRATEGY)?.id ?? ordered[0]?.id ?? requested ?? null
}

export function htmlExportSupported(capabilities: Capabilities | null | undefined): boolean {
  return HTML_CAPABILITY_PATHS.some((path) => isCapabilityAvailable(capabilities, path))
}

function readVersion(source: Record<string, unknown> | null | undefined, keys: readonly string[]): string | null {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function serverSkillVersion(manifest: Record<string, unknown> | null | undefined, version: Record<string, unknown> | null | undefined): string | null {
  return readVersion(manifest, ['skill_version', 'version']) ?? readVersion(version, ['skill_version', 'skill'])
}

export function exportFileName(strategy: string, format: ExportFormat, revision: number | null): string {
  const base = format === 'quality_passport' ? 'passport' : `deckdna_${strategy}`
  const suffix = revision === null ? '' : `_r${revision}`
  return `${base}${suffix}.${EXTENSION[format]}`
}

export function withPassportMeta(file: DeckFile | null, passport: QualityPassport | null, passportFresh: boolean): DeckFile | null {
  if (!file || !passport || !passportFresh || (file.sizeBytes !== null && file.sha256 !== null)) return file
  const recorded = passport.exports.find((item) => item.format === file.format)
  if (!recorded) return file
  return { ...file, sizeBytes: file.sizeBytes ?? recorded.sizeBytes, sha256: file.sha256 ?? recorded.sha256 }
}

export function currentRevisionOf(auditRevision: number | null | undefined, files: readonly (DeckFile | null)[]): number | null {
  const revisions = [auditRevision, ...files.map((file) => file?.deckRevision)].filter((value): value is number => typeof value === 'number')
  return revisions.length > 0 ? Math.max(...revisions) : null
}
