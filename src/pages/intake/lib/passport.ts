import type { BrandbookSummary, BrandConflict, BrandPriority, TemplateSummary } from '@/entities/assistant'
import type { DesignDna, DesignSystem } from '@/entities/template'

const ROLE_ORDER = ['title', 'section', 'content', 'closing', 'divider']
const ROLE_LABEL: Record<string, string> = {
  title: 'Обложки',
  section: 'Разделы',
  content: 'Рабочие',
  closing: 'Финал',
  divider: 'Разделители',
}
const FIELD_LABEL: Record<string, string> = {
  'color.primary': 'Главный цвет',
  'color.secondary': 'Второй цвет',
  'color.accent': 'Акцентный цвет',
  'color.background': 'Фон',
  'color.text': 'Цвет текста',
  'font.heading': 'Шрифт заголовков',
  'font.body': 'Шрифт текста',
}
const MAX_SWATCHES = 6
const MAX_PREVIEWS = 4

export interface PassportColor {
  hex: string
  name: string
  share: number | null
}

export interface PassportFonts {
  declared: string[]
  observed: { name: string; share: number }[]
  conflict: boolean
}

export interface PassportRole {
  role: string
  label: string
  slides: number
}

export interface PassportConflict {
  field: string
  label: string
  kind: 'color' | 'font'
  template: string
  brandbook: string
  chosen: 'template' | 'brandbook'
}

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const hex = value.trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null
}

function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

export function colorName(value: string): string {
  const hex = normalizeHex(value)
  if (!hex) return 'цвет'
  const [h, s, l] = hsl(hex)
  if (l > 0.94) return 'белый'
  if (l < 0.1) return 'чёрный'
  if (s < 0.12) return l < 0.35 ? 'тёмно-серый' : l > 0.75 ? 'светло-серый' : 'серый'
  const base =
    h < 15 || h >= 345 ? 'красный'
    : h < 40 ? (l < 0.35 ? 'коричневый' : 'оранжевый')
    : h < 70 ? 'жёлтый'
    : h < 165 ? 'зелёный'
    : h < 195 ? 'бирюзовый'
    : h < 255 ? (l > 0.65 ? 'голубой' : 'синий')
    : h < 290 ? 'фиолетовый'
    : 'розовый'
  if (base === 'голубой' || base === 'коричневый') return base
  if (l < 0.25) return `тёмно-${base}`
  if (l > 0.8) return `светло-${base}`
  return base
}

export function passportColors(summary: TemplateSummary, system: DesignSystem | null): PassportColor[] {
  const seen = new Set<string>()
  const colors: PassportColor[] = []
  const push = (hex: string | null, share: number | null) => {
    if (!hex || seen.has(hex) || colors.length >= MAX_SWATCHES) return
    seen.add(hex)
    colors.push({ hex, name: colorName(hex), share })
  }
  for (const used of system?.usedColors ?? []) push(normalizeHex(used.hex), used.share)
  if (colors.length === 0) for (const slot of system?.palette ?? []) push(normalizeHex(slot.hex), null)
  if (colors.length === 0) for (const hex of summary.palette) push(normalizeHex(hex), null)
  return colors
}

export function passportFonts(summary: TemplateSummary, system: DesignSystem | null): PassportFonts {
  const declared = [...new Set(system?.declaredFonts?.length ? system.declaredFonts : [summary.heading_font, summary.body_font].filter((font): font is string => Boolean(font)))]
  const observed = (system?.observedFonts ?? []).slice(0, 3).map((font) => ({ name: font.name, share: font.share }))
  return { declared, observed, conflict: Boolean(system?.fontConflict) }
}

export function passportRoles(summary: TemplateSummary): PassportRole[] {
  return Object.entries(summary.roles)
    .filter(([role, slides]) => role in ROLE_LABEL && slides > 0)
    .sort(([a], [b]) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
    .map(([role, slides]) => ({ role, label: ROLE_LABEL[role] ?? role, slides }))
}

export function previewIds(summary: TemplateSummary, dna: DesignDna | undefined): string[] {
  const ids = [...summary.preview_artifact_ids, ...(dna?.exemplars ?? []).map((exemplar) => exemplar.preview_artifact_id ?? '')]
  return [...new Set(ids.filter(Boolean))].slice(0, MAX_PREVIEWS)
}

function conflictLabel(conflict: BrandConflict): string {
  if (conflict.field && FIELD_LABEL[conflict.field]) return FIELD_LABEL[conflict.field] ?? ''
  return conflict.kind === 'font' ? 'Шрифт' : 'Цвет'
}

export function passportConflicts(brandbook: BrandbookSummary | null, priority: BrandPriority): PassportConflict[] {
  return (brandbook?.conflicts ?? []).flatMap((conflict) => {
    if (!conflict.template || !conflict.brandbook) return []
    const kind = conflict.kind === 'font' || conflict.field?.startsWith('font') ? 'font' : 'color'
    return [{ field: conflict.field ?? `${kind}-${conflict.template}`, label: conflictLabel(conflict), kind, template: conflict.template, brandbook: conflict.brandbook, chosen: priority }]
  })
}

export function cleanLayoutName(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed || trimmed.toLowerCase() === 'unresolved' || /^\d+$/.test(trimmed)) return ''
  const stripped = trimmed
    .replace(/^(?:layout|slide[_-]?layout|master)\s*[_.\-—:#№]*\s*\d*\s*[_.\-—:]*\s*/i, '')
    .replace(/^\d+\s*[_.\-—:)]+\s*/, '')
    .trim()
  if (!stripped || /^\d+$/.test(stripped)) return ''
  return stripped
}

export function dnaFileName(templateName: string | null): string {
  const base = (templateName ?? 'template').replace(/\.[^.]+$/, '').trim().replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '')
  return `${base || 'template'}-design-dna.json`
}

export function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
