import type { SlidePlan } from '../model/types'

export type SufficiencyStatus = 'short' | 'ok' | 'excess'

export interface PlanSufficiency {
  status: SufficiencyStatus
  contentSlides: number | null
  targetSlides: number | null
}

export interface ResearchSource {
  id: string
  title: string
  url: string | null
  site: string | null
  accessedAt: string | null
  facts: number | null
}

export interface PlanResearch {
  queries: string[]
  sources: ResearchSource[]
  seconds: number | null
}

export type UnitOrigin = 'user' | 'web' | 'model'

export interface PlanProgress {
  stage: string | null
  queries: string[]
  sources: ResearchSource[]
  slides: SlidePlan[]
}

export const EMPTY_PROGRESS: PlanProgress = { stage: null, queries: [], sources: [], slides: [] }

const ORIGIN_ALIASES: Record<string, UnitOrigin> = {
  user: 'user',
  content: 'user',
  pack: 'user',
  source: 'user',
  web: 'web',
  internet: 'web',
  research: 'web',
  search: 'web',
  model: 'model',
  llm: 'model',
  knowledge: 'model',
  generated: 'model',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function siteOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function parseSufficiency(value: unknown): PlanSufficiency | null {
  if (!isRecord(value)) return null
  const status = value.status
  if (status !== 'short' && status !== 'ok' && status !== 'excess') return null
  return {
    status,
    contentSlides: firstNumber(value, ['content_slides', 'supported_slides', 'enough_for']),
    targetSlides: firstNumber(value, ['target_slides', 'target_slide_count', 'target']),
  }
}

export function parseSource(value: unknown, index = 0): ResearchSource | null {
  if (!isRecord(value)) return null
  const url = firstString(value, ['url', 'href', 'link'])
  const title = firstString(value, ['title', 'name']) ?? siteOf(url)
  if (!title) return null
  return {
    id: firstString(value, ['id', 'source_id']) ?? url ?? `source-${index + 1}`,
    title,
    url,
    site: firstString(value, ['site', 'domain']) ?? siteOf(url),
    accessedAt: firstString(value, ['accessed_at', 'retrieved_at', 'fetched_at']),
    facts: firstNumber(value, ['facts_count', 'facts', 'fact_count']),
  }
}

function parseSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return []
  return value.map(parseSource).filter((source): source is ResearchSource => source !== null)
}

function parseQueries(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item : isRecord(item) ? firstString(item, ['query', 'text']) : null))
    .filter((item): item is string => Boolean(item && item.trim()))
}

export function parseResearch(value: unknown): PlanResearch | null {
  if (!isRecord(value)) return null
  const research: PlanResearch = {
    queries: parseQueries(value.queries),
    sources: parseSources(value.sources),
    seconds: firstNumber(value, ['duration_s', 'seconds', 'elapsed_s']),
  }
  return research.queries.length > 0 || research.sources.length > 0 || research.seconds !== null ? research : null
}

export function unitOrigin(unit: object): UnitOrigin | null {
  const raw = (unit as Record<string, unknown>).origin
  const key = typeof raw === 'string' ? raw : isRecord(raw) ? firstString(raw, ['kind', 'type']) : null
  return key ? (ORIGIN_ALIASES[key.toLowerCase()] ?? null) : null
}

export function unitSourceId(unit: object): string | null {
  const record = unit as Record<string, unknown>
  const direct = firstString(record, ['source_id'])
  if (direct) return direct
  return isRecord(record.origin) ? firstString(record.origin, ['source_id', 'url']) : null
}

export function isUnitLocked(unit: object): boolean {
  return (unit as Record<string, unknown>).locked === true
}

function upsertSource(sources: readonly ResearchSource[], source: ResearchSource): ResearchSource[] {
  return sources.some((item) => item.id === source.id) ? sources.map((item) => (item.id === source.id ? source : item)) : [...sources, source]
}

function isSlidePlan(value: unknown): value is SlidePlan {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title_intent === 'string' && Array.isArray(value.content_units)
}

export function applyPlanEvent(progress: PlanProgress, type: string, data: unknown): PlanProgress {
  if (!isRecord(data)) return progress
  const stage = firstString(data, ['stage'])
  const next = stage && stage !== progress.stage ? { ...progress, stage } : progress
  if (type === 'research.query') {
    const query = firstString(data, ['query', 'text'])
    return query && !next.queries.includes(query) ? { ...next, queries: [...next.queries, query] } : next
  }
  if (type === 'research.source') {
    const source = parseSource(data.source ?? data, next.sources.length)
    return source ? { ...next, sources: upsertSource(next.sources, source) } : next
  }
  if (type === 'plan.slide') {
    const slide = data.slide
    if (!isSlidePlan(slide)) return next
    const slides = next.slides.some((item) => item.id === slide.id) ? next.slides.map((item) => (item.id === slide.id ? slide : item)) : [...next.slides, slide]
    return { ...next, slides }
  }
  return next
}

export interface SseEvent {
  id: number | null
  type: string
  data: unknown
}

export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    let id: number | null = null
    let type = 'message'
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':')
      if (colon <= 0) continue
      const field = line.slice(0, colon)
      const value = line.slice(colon + 1).replace(/^ /, '')
      if (field === 'id') id = Number.isFinite(Number(value)) ? Number(value) : null
      else if (field === 'event') type = value
      else if (field === 'data') data.push(value)
    }
    if (data.length === 0) continue
    let parsed: unknown = data.join('\n')
    try {
      parsed = JSON.parse(parsed as string)
    } catch {
      parsed = null
    }
    events.push({ id, type, data: parsed })
  }
  return events
}
