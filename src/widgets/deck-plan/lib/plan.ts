import { isEditableUnit, slidePurposeLabel, type DeckPlan, type SlidePlan, type UnitOrigin } from '@/entities/generation'
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

export function parseEvidenceRef(raw: string): EvidenceRef {
  const [packId = null, second = null, third = null] = raw.split(':')
  if (second === null) return { raw, packId: null, sectionId: null, blockId: null, meta: false }
  if (second === 'meta') return { raw, packId, sectionId: null, blockId: null, meta: true }
  return { raw, packId, sectionId: second, blockId: third, meta: false }
}

const DATASET_REF = /^ds-([0-9a-f]+)(?:-|$)/

export function slideSources(evidenceIds: readonly string[], headings: ReadonlyMap<string, string>): SlideSource[] {
  const sources = new Map<string, SlideSource>()
  for (const raw of evidenceIds) {
    const ref = parseEvidenceRef(raw)
    const dataset = DATASET_REF.exec(raw)?.[1] ?? null
    const key = ref.meta ? 'meta' : dataset ? `ds-${dataset}` : (ref.sectionId ?? raw)
    const label = ref.meta ? 'Заголовок контента' : dataset ? 'Ваша таблица' : ref.sectionId ? (headings.get(ref.sectionId) ?? ref.sectionId) : raw
    const existing = sources.get(key)
    if (existing) existing.refs.push(raw)
    else sources.set(key, { key, label, refs: [raw] })
  }
  return [...sources.values()]
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
      sources: slideSources(slide.evidence_ids, headings),
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
