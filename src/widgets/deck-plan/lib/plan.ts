import { isEditableUnit, slidePurposeLabel, unitOrigin, type DeckPlan, type SlidePlan, type UnitOrigin } from '@/entities/generation'
import { formatIndex } from '@/shared/lib/format'

export type QuickActionKind = 'shorten' | 'split' | 'merge_next' | 'to_chart' | 'to_diagram' | 'remove'

export interface SlideChartOption {
  type: string
  label: string
  active: boolean
  reasons: string[]
}

export interface SlideChartView {
  type: string
  label: string
  why: string
  reasons: string[]
  options: SlideChartOption[]
  viewId: string | null
  previewArtifactId: string | null
}

export interface EvidenceRef {
  raw: string
  packId: string | null
  sectionId: string | null
  blockId: string | null
  meta: boolean
}

export interface SlideSource {
  key: string
  label: string
  refs: string[]
}

export interface PlanRow {
  id: string
  number: string
  purpose: string
  title: string
  titleIntent: string
  keyMessage: string
  idea: string | null
  visual: string
  sources: SlideSource[]
  sectionId: string | null
  sectionTitle: string | null
  chart: SlideChartView | null
  supportsKeyMessage: boolean | null
}

export interface PlanSectionSummary {
  id: string
  title: string
  count: number
  range: string
}

export interface PlanStats {
  slides: number
  withSources: number
  withVisual: number
  mandatory: number
}

export interface PlanView {
  rows: PlanRow[]
  sections: PlanSectionSummary[]
  stats: PlanStats
}

export const VISUAL_LABEL: Record<string, string> = {
  none: 'Текст',
  image: 'Изображение',
  icon_set: 'Иконки',
  chart: 'График',
  table: 'Таблица',
  diagram: 'Схема',
  screenshot: 'Скриншот',
  quote: 'Цитата',
  icon: 'Иконки',
}

export const CHART_TYPE_LABEL: Record<string, string> = {
  line: 'Линия',
  bar: 'Столбцы',
  bar_horizontal: 'Горизонтальные столбцы',
  bar_stacked: 'Накопительные столбцы',
  bar_stacked_100: 'Столбцы 100%',
  histogram: 'Гистограмма',
  pie: 'Круговая',
  doughnut: 'Кольцевая',
  donut: 'Кольцевая',
  scatter: 'Точечная',
  kpi: 'Карточки с числами',
  table: 'Таблица',
}

export function chartTypeLabel(type: string): string {
  return CHART_TYPE_LABEL[type] ?? type
}

export const EDITOR_VISUALS = ['none', 'chart', 'table', 'diagram', 'image'] as const satisfies readonly NonNullable<SlidePlan['desired_visual']>[]

export const ORIGIN_LABEL: Record<UnitOrigin, string> = {
  user: 'ваш контент',
  web: 'интернет',
  model: 'знания модели',
}

export type SourceKind = 'table' | 'text' | 'web'

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  table: 'Таблица',
  text: 'Текст',
  web: 'Интернет',
}

const SOURCE_KIND_ORDER: readonly SourceKind[] = ['table', 'text', 'web']

const BOOKENDS = new Set(['title', 'thank_you', 'cta', 'agenda'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

export function parseSlideChartView(slide: Pick<SlidePlan, 'chart'>): SlideChartView | null {
  const raw = slide.chart
  if (!isRecord(raw) || typeof raw.type !== 'string' || !raw.type.trim()) return null
  const type = raw.type.trim()
  const label = chartTypeLabel(type)
  const reasons = stringArray(raw.reasons)
  const rawWhy = typeof raw.why === 'string' && raw.why.trim() ? raw.why.trim() : null
  const why = rawWhy ?? (reasons.length > 0 ? `${label}: ${reasons.join(', ')}.` : `Выбран тип «${label}» по структуре данных.`)
  const seen = new Set<string>([type])
  const options: SlideChartOption[] = [{ type, label, active: true, reasons }]
  if (Array.isArray(raw.alternatives)) {
    for (const item of raw.alternatives) {
      if (!isRecord(item) || typeof item.type !== 'string') continue
      const altType = item.type.trim()
      if (!altType || seen.has(altType)) continue
      seen.add(altType)
      options.push({
        type: altType,
        label: chartTypeLabel(altType),
        active: false,
        reasons: stringArray(item.reasons),
      })
    }
  }
  return {
    type,
    label,
    why,
    reasons,
    options,
    viewId: typeof raw.view_id === 'string' ? raw.view_id : null,
    previewArtifactId: typeof raw.preview_artifact_id === 'string' ? raw.preview_artifact_id : null,
  }
}

export function resolveDeckKeyMessage(plan: DeckPlan, explicit?: string | null): string {
  const candidates = [
    explicit,
    plan.brief.key_message,
    plan.slides.find((slide) => slide.purpose === 'overview')?.key_message,
    plan.slides.find((slide) => slide.purpose === 'data')?.key_message,
    plan.objective,
    plan.brief.purpose,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

export function availableQuickActions(plan: DeckPlan, slideId: string): QuickActionKind[] {
  const ordered = [...plan.slides].sort((a, b) => a.index - b.index)
  const index = ordered.findIndex((item) => item.id === slideId)
  const slide = ordered[index]
  if (!slide) return []
  const texts = slide.content_units.filter((unit) => isEditableUnit(unit) && Boolean((unit.text ?? '').trim()))
  const actions: QuickActionKind[] = []
  const isBookend = BOOKENDS.has(slide.purpose)
  if (!isBookend && texts.length > 0) actions.push('shorten')
  if (!isBookend && texts.length >= 2) actions.push('split')
  const next = ordered[index + 1]
  if (slide.purpose !== 'title' && next && !BOOKENDS.has(next.purpose)) actions.push('merge_next')
  if (!isBookend && slide.desired_visual !== 'chart' && !slide.chart) actions.push('to_chart')
  if (!isBookend && slide.desired_visual !== 'diagram' && texts.length >= 2) actions.push('to_diagram')
  if (ordered.length > 1 && slide.purpose !== 'title') actions.push('remove')
  return actions
}

const UNIT_VISUAL: Record<string, string> = {
  chart: 'chart',
  table: 'table',
  diagram: 'diagram',
  image: 'image',
  icon: 'icon_set',
  quote: 'quote',
}

const DECK_PURPOSE_LABEL: Record<string, string> = {
  feature: 'фича',
  product: 'продукт',
  project: 'проект',
  initiative: 'инициатива',
}

const UNASSIGNED_SECTION = 'Вне разделов'

export function deckPurposeLabel(purpose: string): string {
  return DECK_PURPOSE_LABEL[purpose] ?? purpose
}

export interface SourcePackLike {
  title_hint?: string | null
  sections?: readonly { id: string; heading: string }[] | null
  blocks?: readonly { id: string; title?: string | null }[] | null
  datasets?: readonly { id: string; title?: string | null; file_name?: string | null; file?: string | null }[] | null
  tables?: readonly { title?: string | null }[] | null
}

export interface SourcePlanLike {
  sections?: readonly { id: string; title: string }[] | null
}

const UNKNOWN_SOURCE_LABEL = 'ваши материалы'
const AUTHOR_NOTES_LABEL = 'Тезисы автора'
const SECTION_NUM_RE = /^sec[-_](\d+)$/i
const DATASET_TOKEN_RE = /^(?:ds:)?(ds[-_][a-z0-9_]+?)(?:-(?:trend|by\d+|corr|dist|top|part|stat|i\d+|row\d+|col\d+)\b.*)?$/i
const TECHNICAL_ID_RE = /^(?:(?:pack|sec|ds|ev|art|slide|tbl|block|unit)[-_:]|[bs]:|[a-z]{1,6}[-_]\d|[0-9a-f]{8,})/i

function registerSectionAliases(map: Map<string, string>, rawId: string, label: string, overwrite = true) {
  const id = rawId.trim()
  const clean = label.trim()
  if (!id || !clean) return
  if (overwrite || !map.has(id)) map.set(id, clean)
  const match = SECTION_NUM_RE.exec(id)
  if (!match) return
  const num = Number(match[1])
  const padded = String(num).padStart(2, '0')
  for (const alias of [`sec-${num}`, `sec_${num}`, `sec-${padded}`, `sec_${padded}`]) {
    if (overwrite || !map.has(alias)) map.set(alias, clean)
  }
}

export function contentPackSourceMap(pack?: SourcePackLike | null, plan?: SourcePlanLike | null): Map<string, string> {
  const map = new Map<string, string>()

  for (const section of plan?.sections ?? []) {
    if (section.id && section.title?.trim()) {
      registerSectionAliases(map, section.id, section.title, false)
    }
  }

  for (const block of pack?.blocks ?? []) {
    const title = block.title?.trim()
    if (!title) continue
    const secId = block.id.startsWith('s:') ? block.id.slice(2) : block.id.startsWith('b:') ? (block.id.split(':')[1] ?? '') : ''
    if (secId) registerSectionAliases(map, secId, title, false)
  }

  const sections = pack?.sections ?? []
  sections.forEach((section, index) => {
    const heading = section.heading?.trim()
    if (!heading) return
    registerSectionAliases(map, section.id, heading, true)
    map.set(`ev_sec_${index}`, heading)
    const oneBasedPadded = String(index + 1).padStart(2, '0')
    for (const alias of [`sec_${oneBasedPadded}`, `sec-${oneBasedPadded}`]) {
      if (!map.has(alias)) map.set(alias, heading)
    }
  })

  const datasets = pack?.datasets ?? []
  const datasetLabels: string[] = []
  for (const dataset of datasets) {
    const label = dataset.title?.trim() || dataset.file_name?.trim() || dataset.file?.trim()
    if (!label) continue
    datasetLabels.push(label)
    if (dataset.id?.trim()) map.set(dataset.id.trim(), label)
  }
  if (datasetLabels.length === 1 && datasetLabels[0]) {
    map.set('ds:*', datasetLabels[0])
  }

  for (const [index, table] of (pack?.tables ?? []).entries()) {
    const title = table.title?.trim()
    if (title) map.set(`ev_tbl_${index}`, title)
  }

  const metaLabel =
    pack?.title_hint?.trim() ||
    sections.find((section) => section.heading?.trim())?.heading?.trim() ||
    (pack?.blocks ?? []).find((block) => block.title?.trim())?.title?.trim() ||
    (plan?.sections ?? []).find((section) => section.title?.trim())?.title?.trim()
  if (metaLabel) map.set('meta', metaLabel)

  return map
}

export function parseEvidenceRef(raw: string): EvidenceRef {
  if (raw.trim() === 'meta') return { raw, packId: null, sectionId: null, blockId: null, meta: true }
  const [packId = null, second = null, third = null] = raw.split(':')
  if (second === null) return { raw, packId: null, sectionId: null, blockId: null, meta: false }
  if (second === 'meta') return { raw, packId, sectionId: null, blockId: null, meta: true }
  return { raw, packId, sectionId: second, blockId: third, meta: false }
}

function resolveSectionHeading(token: string, raw: string, headings: ReadonlyMap<string, string>): string | null {
  const direct = headings.get(token)?.trim() || headings.get(raw)?.trim()
  if (direct) return direct
  const match = SECTION_NUM_RE.exec(token)
  if (match) {
    const num = Number(match[1])
    const padded = String(num).padStart(2, '0')
    for (const candidate of [`sec-${num}`, `sec_${num}`, `sec-${padded}`, `sec_${padded}`]) {
      const found = headings.get(candidate)?.trim()
      if (found) return found
    }
    if (num >= 1 && !headings.has('sec-1') && headings.has('sec-0')) {
      const zeroBased = headings.get(`sec-${num - 1}`)?.trim()
      if (zeroBased) return zeroBased
    }
  }
  if (/^sec[-_]notes\b/i.test(token) || raw.includes('user:notes')) {
    return AUTHOR_NOTES_LABEL
  }
  if (!TECHNICAL_ID_RE.test(token) && /[а-яё]/i.test(token)) {
    return token
  }
  return null
}

export function slideSources(evidenceIds: readonly string[], headings: ReadonlyMap<string, string>): SlideSource[] {
  const sources = new Map<string, SlideSource>()
  for (const raw of evidenceIds) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const ref = parseEvidenceRef(trimmed)
    const token = (ref.sectionId ?? trimmed).trim()
    const datasetId = DATASET_TOKEN_RE.exec(token)?.[1] ?? DATASET_TOKEN_RE.exec(trimmed)?.[1] ?? null

    let key: string
    let label: string

    if (ref.meta || token === 'meta' || trimmed.endsWith(':meta')) {
      const metaHeading = headings.get('meta')?.trim()
      key = metaHeading ? 'meta' : 'materials'
      label = metaHeading || UNKNOWN_SOURCE_LABEL
    } else if (datasetId) {
      const dsHeading = headings.get(token)?.trim() || headings.get(datasetId)?.trim() || headings.get('ds:*')?.trim()
      key = dsHeading ? datasetId : 'materials'
      label = dsHeading || UNKNOWN_SOURCE_LABEL
    } else {
      const resolved = resolveSectionHeading(token, trimmed, headings)
      key = resolved ? token : 'materials'
      label = resolved || UNKNOWN_SOURCE_LABEL
    }

    const dedupeKey = [...sources.values()].find((item) => item.label === label)?.key ?? key
    const existing = sources.get(dedupeKey)
    if (existing) existing.refs.push(raw)
    else sources.set(dedupeKey, { key: dedupeKey, label, refs: [raw] })
  }
  return [...sources.values()]
}

export function slideSourceKinds(slide: Pick<SlidePlan, 'evidence_ids' | 'content_units'>): SourceKind[] {
  const found = new Set<SourceKind>()
  for (const raw of slide.evidence_ids) {
    const ref = parseEvidenceRef(raw)
    const token = (ref.sectionId ?? raw).trim()
    if (ref.meta || token === 'meta') continue
    found.add(/^(?:ds:)?ds[-_]/i.test(token) ? 'table' : 'text')
  }
  if (slide.content_units.some((unit) => unitOrigin(unit) === 'web')) found.add('web')
  return SOURCE_KIND_ORDER.filter((kind) => found.has(kind))
}

export function plannedVisual(slide: Pick<SlidePlan, 'desired_visual' | 'content_units'>): string | null {
  const unitVisual = slide.content_units.map((unit) => UNIT_VISUAL[unit.kind]).find(Boolean)
  const visual = slide.desired_visual && slide.desired_visual !== 'none' ? slide.desired_visual : (unitVisual ?? slide.desired_visual)
  return visual ? (VISUAL_LABEL[visual] ?? visual) : null
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export function slideIdea(slide: Pick<SlidePlan, 'key_message' | 'title_intent'>, objective: string): string | null {
  const idea = slide.key_message.trim()
  if (!idea) return null
  const repeated = [slide.title_intent, objective].some((text) => normalize(text) === normalize(idea))
  return repeated ? null : idea
}

export function formatSlideRange(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  if (sorted.length === 0) return 'нет слайдов'
  const runs: [number, number][] = []
  for (const value of sorted) {
    const last = runs.at(-1)
    if (last && value === last[1] + 1) last[1] = value
    else runs.push([value, value])
  }
  const text = runs.map(([start, end]) => (start === end ? String(start) : `${start}–${end}`)).join(', ')
  return `${sorted.length === 1 ? 'слайд' : 'слайды'} ${text}`
}

export function buildPlanView(plan: DeckPlan, headings: ReadonlyMap<string, string>): PlanView {
  const slides = [...plan.slides].sort((a, b) => a.index - b.index)
  const numberById = new Map(slides.map((slide, position) => [slide.id, position + 1]))
  const sections = plan.sections ?? []
  const mergedHeadings = contentPackSourceMap(null, plan)
  for (const [key, value] of headings) mergedHeadings.set(key, value)
  const firstSection = new Map<string, { id: string; title: string }>()
  for (const section of sections) {
    for (const slideId of section.slide_ids) if (!firstSection.has(slideId)) firstSection.set(slideId, section)
  }

  const rows: PlanRow[] = slides.map((slide, position) => {
    const section = firstSection.get(slide.id) ?? null
    return {
      id: slide.id,
      number: formatIndex(position + 1),
      purpose: slidePurposeLabel(slide.purpose) ?? 'Контент',
      title: slide.title_intent.trim() || 'Без заголовка',
      titleIntent: slide.title_intent,
      keyMessage: slide.key_message,
      idea: slideIdea(slide, plan.objective),
      visual: plannedVisual(slide) ?? '',
      sources: slideSources(slide.evidence_ids, mergedHeadings),
      sectionId: section?.id ?? null,
      sectionTitle: section?.title ?? null,
      chart: parseSlideChartView(slide),
      supportsKeyMessage: typeof slide.supports_key_message === 'boolean' ? slide.supports_key_message : null,
    }
  })

  const summaries: PlanSectionSummary[] = sections
    .map((section) => {
      const numbers = section.slide_ids.map((id) => numberById.get(id)).filter((value): value is number => value !== undefined)
      return { id: section.id, title: section.title, count: numbers.length, range: formatSlideRange(numbers) }
    })
    .filter((section) => section.count > 0)

  if (summaries.length > 0) {
    const covered = new Set(sections.flatMap((section) => section.slide_ids))
    const outside = slides.filter((slide) => !covered.has(slide.id)).map((slide) => numberById.get(slide.id) ?? 0)
    if (outside.length > 0) summaries.push({ id: 'unassigned', title: UNASSIGNED_SECTION, count: outside.length, range: formatSlideRange(outside) })
  }

  return {
    rows,
    sections: summaries,
    stats: {
      slides: rows.length,
      withSources: rows.filter((row) => row.sources.length > 0).length,
      withVisual: slides.filter((slide) => {
        const visual = plannedVisual(slide)
        return visual !== null && visual !== VISUAL_LABEL.none
      }).length,
      mandatory: slides.filter((slide) => slide.mandatory === true).length,
    },
  }
}
