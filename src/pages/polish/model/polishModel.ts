import type { RegenerateResult, SlideExplain } from '@/entities/assistant'
import { isCriticalIssue, isOpenIssue, type AuditIssue, type AuditRun } from '@/entities/audit'
import { isUnitLocked, slidePurposeLabel, unitOrigin, unitSourceId, type DeckPlan, type ResearchSource, type SlidePlan } from '@/entities/generation'
import type { ExportFormat, QualityPassport } from '@/entities/passport'
import { isCapabilityAvailable, type Capabilities } from '@/entities/system'
import { DEFAULT_STRATEGY, orderVariants, type DeckFile, type SlideInfo, type VariantSummary } from '@/entities/variant'
import { slideSources, type SlideSource } from '@/widgets/deck-plan'
import { formatNumber, pluralize } from '@/shared/lib/format'

const HTML_CAPABILITY_PATHS = [
  'features.html_export',
  'exporters.html',
  'exports.html',
  'exports.formats.html',
  'export_formats.html',
  'formats.html',
  'export.html',
  'html_export',
] as const

const EXTENSION: Record<ExportFormat, string> = {
  pptx: 'pptx',
  pdf: 'pdf',
  html: 'html',
  quality_passport: 'json',
}

export const CHART_TYPE_LABELS: Record<string, string> = {
  line: 'Линия',
  bar: 'Столбцы',
  column: 'Столбцы',
  bar_horizontal: 'Горизонтальные столбцы',
  bar_stacked: 'Накопительные столбцы',
  bar_stacked_100: 'Столбцы 100%',
  pie: 'Круговая',
  doughnut: 'Кольцевая',
  donut: 'Кольцевая',
  table: 'Таблица',
  histogram: 'Гистограмма',
  scatter: 'Точечная',
  kpi: 'Карточки цифр',
  area: 'С областями',
}

export const TASK_LABELS: Record<string, string> = {
  trend: 'Динамика во времени',
  comparison: 'Сравнение категорий',
  composition: 'Структура и доли',
  distribution: 'Распределение',
  correlation: 'Связь показателей',
  part_to_whole: 'Доли целого',
}

const STYLE_CHIPS: readonly { strategy: 'faithful' | 'balanced' | 'visual'; label: string }[] = [
  { strategy: 'faithful', label: 'Строгий' },
  { strategy: 'balanced', label: 'Сбалансированный' },
  { strategy: 'visual', label: 'Визуальный' },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(asText).filter((item): item is string => item !== null)
}

export function chartTypeLabel(type: string | null | undefined): string {
  if (!type) return 'График'
  return CHART_TYPE_LABELS[type] ?? type
}

export function taskLabel(task: string | null | undefined, taskRu?: string | null): string | null {
  if (task && TASK_LABELS[task]) return TASK_LABELS[task]
  if (taskRu && taskRu.trim()) {
    const trimmed = taskRu.trim()
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }
  return task && task.trim() ? task.trim() : null
}

export function defaultPolishVariant(variants: readonly VariantSummary[]): VariantSummary | null {
  const ordered = orderVariants(variants)
  const completed = ordered.filter((variant) => variant.status === 'completed')
  const pool = completed.length > 0 ? completed : ordered
  return pool.find((variant) => variant.strategy === DEFAULT_STRATEGY) ?? pool[0] ?? null
}

export function parseSlideParam(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

export function findSlideAt(
  slides: readonly SlideInfo[],
  slideNumber: number,
  regenerated?: ReadonlyMap<string, RegenerateResult>,
): SlideInfo | undefined {
  if (slides.length === 0) return undefined
  const zeroBased = slides.some((slide) => slide.index === 0)
  const targetIndex = zeroBased ? slideNumber - 1 : slideNumber
  const base = slides.find((slide) => slide.index === targetIndex) ?? slides[slideNumber - 1]
  if (!base) return undefined
  const regen = regenerated?.get(base.id)
  if (!regen) return base
  return {
    ...base,
    ...(regen.slide ?? {}),
    id: base.id,
    variant_id: base.variant_id,
    revision: regen.deck_revision ?? regen.slide?.revision ?? base.revision,
    preview_artifact_id: regen.preview_artifact_id ?? regen.slide?.preview_artifact_id ?? base.preview_artifact_id,
  }
}

export function findPlanSlide(
  plan: DeckPlan | null | undefined,
  slideInfo: SlideInfo | undefined,
  slideNumber: number,
): SlidePlan | undefined {
  if (!plan || plan.slides.length === 0) return undefined
  if (slideInfo?.slide_plan_id) {
    const byId = plan.slides.find((slide) => slide.id === slideInfo.slide_plan_id)
    if (byId) return byId
  }
  return plan.slides.find((slide) => slide.index === slideNumber - 1) ?? plan.slides[slideNumber - 1]
}

export function formatExemplarLabel(exemplar: string | null | undefined): string | null {
  if (!exemplar || !exemplar.trim()) return null
  const match = /slide(\d+)\.xml$/i.exec(exemplar.trim()) ?? /^slide[-_](\d+)$/i.exec(exemplar.trim())
  if (match?.[1]) return `Образец шаблона: слайд #${match[1]}`
  return `Образец шаблона: ${exemplar.trim()}`
}

export interface ExplainOption {
  type: string
  label: string
  reason: string | null
}

export interface ExplainInsightItem {
  id: string
  text: string
}

export interface ExplainView {
  hasChart: boolean
  datasetLabel: string | null
  profileSummary: string | null
  taskText: string | null
  aggregationText: string | null
  chosenType: string | null
  chosenLabel: string | null
  reasons: string[]
  whySummary: string | null
  alternatives: ExplainOption[]
  rejected: ExplainOption[]
  insights: ExplainInsightItem[]
  sourceText: string | null
  purposeLabel: string
  exemplarLabel: string | null
  fallbackNote: string
}

function parseOptionList(items: unknown): ExplainOption[] {
  if (!Array.isArray(items)) return []
  const seen = new Set<string>()
  const result: ExplainOption[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const type = asText(item.type) ?? asText(item.chart_type)
    if (!type || seen.has(type)) continue
    seen.add(type)
    const reasons = asStrings(item.reasons)
    result.push({
      type,
      label: chartTypeLabel(type),
      reason: reasons.length > 0 ? reasons.join(', ') : asText(item.reason),
    })
  }
  return result
}

export function buildExplainView(
  explain: SlideExplain | null | undefined,
  planSlide: SlidePlan | undefined,
  slideInfo: SlideInfo | undefined,
  exemplar?: string | null,
): ExplainView {
  const planChart = isRecord(planSlide?.chart) ? planSlide.chart : null
  const chosenType = explain?.chosen?.type ?? asText(planChart?.type) ?? null
  const hasDataset = Boolean(explain?.dataset && (explain.dataset.file || explain.dataset.title || explain.dataset.id))
  const hasChart = hasDataset || Boolean(chosenType)

  const file = explain?.dataset?.file ?? explain?.dataset?.title ?? null
  const rows = explain?.dataset?.rows ?? null
  const datasetLabel = file ? (rows !== null ? `${file} · ${formatNumber(rows)} ${pluralize(rows, ['строка', 'строки', 'строк'])}` : file) : null

  const profileSummary = explain?.profile_summary ?? null
  const rawTaskRu = isRecord(explain) ? asText(explain.task_ru) : null
  const taskText = taskLabel(explain?.task ?? null, rawTaskRu)
  const aggregationText = isRecord(explain) ? asText(explain.aggregation) : null
  const chosenLabel = chosenType ? chartTypeLabel(chosenType) : null

  const explainReasons = explain?.chosen?.reasons ?? []
  const planReasons = planChart ? asStrings(planChart.reasons) : []
  const reasons = explainReasons.length > 0 ? explainReasons : planReasons
  const planWhy = planChart ? asText(planChart.why) : null
  const whySummary =
    reasons.length > 0
      ? `${chosenLabel ?? 'График'}: ${reasons.join(', ')}.`
      : planWhy ?? (explain?.assistant_note && hasChart ? explain.assistant_note : null)

  const alternatives = [
    ...parseOptionList(explain?.alternatives),
    ...parseOptionList(planChart?.alternatives),
  ].filter((option, index, list) => option.type !== chosenType && list.findIndex((candidate) => candidate.type === option.type) === index)

  const rejected = parseOptionList(explain?.rejected)

  const insights: ExplainInsightItem[] = (explain?.insights ?? []).flatMap((raw, index) => {
    if (!isRecord(raw)) return []
    const text = asText(raw.fact) ?? asText(raw.headline)
    if (!text) return []
    return [{ id: asText(raw.id) ?? `ins-${index}`, text }]
  })

  const sourceText = isRecord(explain) ? asText(explain.source) : null
  const purposeLabel = slidePurposeLabel(slideInfo?.purpose ?? planSlide?.purpose) ?? 'Контентный слайд'
  const exemplarLabel = formatExemplarLabel(exemplar)
  const fallbackNote = explain?.assistant_note || 'Макет подобран под назначение слайда и плотность текста вашего шаблона.'

  return {
    hasChart,
    datasetLabel,
    profileSummary,
    taskText,
    aggregationText,
    chosenType,
    chosenLabel,
    reasons,
    whySummary,
    alternatives,
    rejected,
    insights,
    sourceText,
    purposeLabel,
    exemplarLabel,
    fallbackNote,
  }
}

export interface ReworkChip {
  key: string
  action: string
  chartType?: string
  label: string
  title: string
}

export function buildReworkChips(
  currentStrategy: string,
  alternatives: readonly ExplainOption[],
  hasChart: boolean,
): ReworkChip[] {
  const chips: ReworkChip[] = [
    {
      key: 'other_layout',
      action: 'other_layout',
      label: 'Другая раскладка',
      title: 'Выбрать другой подходящий макет из шаблона только для этого слайда',
    },
    {
      key: 'shorter',
      action: 'shorter',
      label: 'Короче',
      title: 'Сократить текст только на этом слайде',
    },
  ]

  if (alternatives.length > 0) {
    for (const alt of alternatives) {
      chips.push({
        key: `other_chart:${alt.type}`,
        action: 'other_chart',
        chartType: alt.type,
        label: `График: ${alt.label}`,
        title: alt.reason ? `${alt.label}: ${alt.reason}` : `Поменять график на «${alt.label}»`,
      })
    }
  } else if (hasChart) {
    chips.push({
      key: 'other_chart',
      action: 'other_chart',
      label: 'Другой график',
      title: 'Подобрать альтернативный тип графика для этого слайда',
    })
  }

  for (const style of STYLE_CHIPS) {
    if (style.strategy === currentStrategy) continue
    chips.push({
      key: `style:${style.strategy}`,
      action: `style:${style.strategy}`,
      label: `Стиль: ${style.label}`,
      title: `Переверстать только этот слайд в стиле «${style.label}»`,
    })
  }

  return chips
}

export type SlideOriginKind = 'data' | 'user' | 'web' | 'general' | 'locked'

export interface SlideOriginItem {
  key: string
  kind: SlideOriginKind
  label: string
  href?: string | null
  title?: string
}

export interface SlideNotesView {
  speakerNote: string | null
  keyMessage: string | null
  bullets: string[]
  origins: SlideOriginItem[]
  sources: SlideSource[]
}

export function buildSlideNotesView(
  planSlide: SlidePlan | undefined,
  explainView: ExplainView,
  headings: ReadonlyMap<string, string>,
  researchSources: readonly ResearchSource[] = [],
): SlideNotesView {
  const speakerNote = planSlide?.speaker_note?.trim() || null
  const keyMessage = planSlide?.key_message?.trim() || null
  const units = planSlide?.content_units ?? []
  const bullets = units
    .filter((unit) => unit.role !== 'title' && typeof unit.text === 'string' && unit.text.trim())
    .map((unit) => (unit.text as string).trim())

  const sourcesById = new Map(researchSources.map((source) => [source.id, source]))
  const originsMap = new Map<string, SlideOriginItem>()

  const hasDataEvidence = explainView.hasChart || (planSlide?.evidence_ids ?? []).some((id) => id.includes(':ds-'))
  if (hasDataEvidence) {
    const filePart = explainView.datasetLabel?.split(' · ')[0]
    originsMap.set('data', {
      key: 'data',
      kind: 'data',
      label: filePart ? `ваши данные · ${filePart}` : 'ваши данные',
      title: explainView.datasetLabel ?? 'Посчитано по вашей таблице данных',
    })
  }

  let lockedCount = 0
  for (const unit of units) {
    if (isUnitLocked(unit)) lockedCount += 1
    const origin = unitOrigin(unit)
    if (origin === 'web') {
      const sourceId = unitSourceId(unit)
      const webSource = sourceId ? sourcesById.get(sourceId) : undefined
      const key = `web:${webSource?.id ?? 'default'}`
      if (!originsMap.has(key)) {
        originsMap.set(key, {
          key,
          kind: 'web',
          label: `${webSource?.site ?? 'интернет'} ↗`,
          href: webSource?.url ?? null,
          title: webSource?.title ?? 'Внешний источник из поиска',
        })
      }
    } else if (origin === 'model') {
      originsMap.set('general', {
        key: 'general',
        kind: 'general',
        label: 'общие сведения ⚠',
        title: 'Дополнено без внешнего источника — проверьте формулировку',
      })
    } else if (origin === 'user' && !hasDataEvidence) {
      originsMap.set('user', {
        key: 'user',
        kind: 'user',
        label: 'ваш текст',
        title: 'Взято из ваших исходных материалов',
      })
    }
  }

  if (lockedCount > 0) {
    originsMap.set('locked', {
      key: 'locked',
      kind: 'locked',
      label: lockedCount === 1 ? 'закреплено вами' : `закреплено вами (${lockedCount})`,
      title: 'Ваша формулировка: вёрстка сохраняет её смысл',
    })
  }

  if (originsMap.size === 0 && (planSlide?.evidence_ids.length ?? 0) > 0) {
    originsMap.set('user', {
      key: 'user',
      kind: 'user',
      label: 'ваш текст',
      title: 'Взято из ваших исходных материалов',
    })
  }

  const sources = slideSources(planSlide?.evidence_ids ?? [], headings)

  return {
    speakerNote,
    keyMessage,
    bullets,
    origins: [...originsMap.values()],
    sources,
  }
}

export interface PolishNoteInput {
  currentSlide: number
  regeneratingSlideNumber: number | null
  repairPending: boolean
  autopilotPending: boolean
  actionNote: string | null
  explainNote: string | null
  hasChart: boolean
  sessionNote: string | null
  slideOpenIssues: number
  totalOpenIssues: number
}

const pad = (value: number) => String(value).padStart(2, '0')

const BANNED_NOTE_PATTERN = /нейросет|модел[ьиюяей]|генерац|\bии\b|\bai\b|\bllm\b|\bvlm\b|промпт|токен|демо/i

function cleanAssistantNote(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null
  const text = raw.trim()
  if (BANNED_NOTE_PATTERN.test(text)) return null
  return text
}

export function resolvePolishNote(input: PolishNoteInput): string {
  if (input.regeneratingSlideNumber !== null) {
    return `Пересобираю только слайд №${pad(input.regeneratingSlideNumber)} — остальные слайды не трогаю…`
  }
  if (input.repairPending) {
    return 'Исправляю выбранные замечания и перепроверяю слайды…'
  }
  if (input.autopilotPending) {
    return 'Принял безопасные настройки по умолчанию — собираю готовую колоду…'
  }
  const action = cleanAssistantNote(input.actionNote)
  if (action) return action

  if (input.hasChart) {
    const explain = cleanAssistantNote(input.explainNote)
    if (explain) return explain
  }

  if (input.totalOpenIssues === 0) {
    return 'Колода готова: все графики редактируемые, критичных ошибок вёрстки нет — можно скачивать или точечно поправить любой слайд.'
  }
  if (input.slideOpenIssues > 0) {
    return `На слайде №${pad(input.currentSlide)} есть ${input.slideOpenIssues} ${pluralize(input.slideOpenIssues, ['замечание', 'замечания', 'замечаний'])} — можно исправить автоматически или переделать только этот слайд.`
  }
  const session = cleanAssistantNote(input.sessionNote)
  if (session) return session

  return `На слайде №${pad(input.currentSlide)} всё чисто; всего в колоде ${input.totalOpenIssues} ${pluralize(input.totalOpenIssues, ['замечание ждёт', 'замечания ждут', 'замечаний ждут'])} решения.`
}

export function htmlExportSupported(capabilities: Capabilities | null | undefined): boolean {
  return HTML_CAPABILITY_PATHS.some((path) => isCapabilityAvailable(capabilities, path))
}

export function exportFileName(strategy: string, format: ExportFormat, revision: number | null, mimeType: string | null = null): string {
  const base = format === 'quality_passport' ? 'passport' : `deckdna_${strategy}`
  const suffix = revision === null ? '' : `_r${revision}`
  if (format === 'html' && !mimeType?.includes('text/html')) return `${base}${suffix}_html.zip`
  return `${base}${suffix}.${EXTENSION[format]}`
}

export function withPassportMeta(file: DeckFile | null, passport: QualityPassport | null, passportFresh: boolean): DeckFile | null {
  if (!file || !passport || !passportFresh || (file.sizeBytes !== null && file.sha256 !== null)) return file
  const recorded = passport.exports.find((item) => item.format === file.format)
  if (!recorded) return file
  return { ...file, sizeBytes: file.sizeBytes ?? recorded.sizeBytes, sha256: file.sha256 ?? recorded.sha256 }
}

export function currentRevisionOf(
  auditRevision: number | null | undefined,
  files: readonly (DeckFile | null)[],
  regeneratedRevision: number | null = null,
): number {
  const revisions = [1, auditRevision, regeneratedRevision, ...files.map((file) => file?.deckRevision)].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  )
  return Math.max(...revisions)
}

export function openCriticalSummary(issues: readonly AuditIssue[] | undefined, audit: Pick<AuditRun, 'summary_by_severity'> | undefined) {
  if (issues) {
    const open = issues.filter((issue) => isOpenIssue(issue) && isCriticalIssue(issue))
    return {
      blockers: open.filter((issue) => issue.severity === 'blocker').length,
      errors: open.filter((issue) => issue.severity === 'error').length,
    }
  }
  if (!audit) return null
  return { blockers: audit.summary_by_severity.blocker, errors: audit.summary_by_severity.error }
}
