import type { JobEvent } from '@/entities/assistant'
import { slidePurposeLabel, type DeckPlan, type SlidePlan } from '@/entities/generation'
import type { SlideInfo } from '@/entities/variant'
import { artifactUrl } from '@/shared/api'
import { formatIndex } from '@/shared/lib/format'
import type { VariantCardState } from './variants'

export type FilmstripSlotState = 'ready' | 'building' | 'draft'

export interface FilmstripSlot {
  key: string
  index: number
  slideNumber: number
  slideId: string
  title: string
  purposeLabel: string | null
  previewArtifactId: string | null
  imageUrl: string | null
  state: FilmstripSlotState
}

export interface BuildFilmstripSlotsOptions {
  plan?: DeckPlan | null
  variantSlides?: readonly SlideInfo[] | null
  events?: readonly JobEvent[]
  variantId?: string | null
  variantState?: VariantCardState
}

interface ReadySlideEvent {
  sequence: number
  slideId: string | null
  index: number | null
  previewArtifactId: string
}

function readString(event: JobEvent, key: string): string | null {
  const inData = event.data[key]
  if (typeof inData === 'string' && inData.trim()) return inData.trim()
  const top = event[key]
  if (typeof top === 'string' && top.trim()) return top.trim()
  return null
}

function readNumber(event: JobEvent, key: string): number | null {
  const inData = event.data[key]
  if (typeof inData === 'number' && Number.isFinite(inData)) return inData
  const top = event[key]
  if (typeof top === 'number' && Number.isFinite(top)) return top
  return null
}

function matchesVariant(event: JobEvent, variantId: string | null | undefined): boolean {
  if (!variantId || !variantId.startsWith('var_')) return true
  const eventVariantId = readString(event, 'variant_id')
  return !eventVariantId || eventVariantId === variantId
}

function collectReadyEvents(events: readonly JobEvent[], variantId: string | null | undefined): ReadySlideEvent[] {
  const list: ReadySlideEvent[] = []
  for (const event of events) {
    if (event.type !== 'slide.ready') continue
    if (!matchesVariant(event, variantId)) continue
    const previewArtifactId = readString(event, 'preview_artifact_id') ?? readString(event, 'image_artifact_id')
    if (!previewArtifactId) continue
    list.push({
      sequence: event.sequence,
      slideId: readString(event, 'slide_id'),
      index: readNumber(event, 'index'),
      previewArtifactId,
    })
  }
  return list
}

export function buildFilmstripSlots({
  plan,
  variantSlides,
  events = [],
  variantId,
  variantState = 'running',
}: BuildFilmstripSlotsOptions): FilmstripSlot[] {
  const planSlides: readonly SlidePlan[] = plan?.slides ?? []
  const slides: readonly SlideInfo[] = variantSlides ?? []
  const readyEvents = collectReadyEvents(events, variantId)

  const totalCount = Math.max(planSlides.length, slides.length, readyEvents.length)
  if (totalCount === 0) return []

  const eventsZeroBased = readyEvents.some((item) => item.index === 0)
  const slidesZeroBased = slides.some((item) => item.index === 0)

  const eventBySlideId = new Map<string, string>()
  const eventBySlotIndex = new Map<number, string>()
  for (const item of readyEvents) {
    if (item.slideId) {
      eventBySlideId.set(item.slideId, item.previewArtifactId)
    }
    if (item.index !== null) {
      const slotIdx = eventsZeroBased ? item.index : Math.max(0, item.index - 1)
      eventBySlotIndex.set(slotIdx, item.previewArtifactId)
    }
  }

  const variantSlideByPlanId = new Map<string, SlideInfo>()
  const variantSlideBySlotIndex = new Map<number, SlideInfo>()
  for (const slide of slides) {
    if (slide.slide_plan_id) {
      variantSlideByPlanId.set(slide.slide_plan_id, slide)
    }
    const slotIdx = slidesZeroBased ? slide.index : Math.max(0, slide.index - 1)
    variantSlideBySlotIndex.set(slotIdx, slide)
  }

  let markedBuilding = false

  return Array.from({ length: totalCount }, (_, index): FilmstripSlot => {
    const planSlide = planSlides[index]
    const slideId = planSlide?.id ?? `slide-${index}`
    const variantSlide =
      (planSlide ? variantSlideByPlanId.get(planSlide.id) : undefined) ??
      variantSlideBySlotIndex.get(index) ??
      slides[index]

    const previewArtifactId =
      (planSlide ? eventBySlideId.get(planSlide.id) : undefined) ??
      eventBySlotIndex.get(index) ??
      variantSlide?.preview_artifact_id ??
      null

    const imageUrl = previewArtifactId ? artifactUrl(previewArtifactId) : null
    const isReady = Boolean(imageUrl) || (variantState === 'done' && Boolean(variantSlide))

    let state: FilmstripSlotState = 'draft'
    if (isReady) {
      state = 'ready'
    } else if (!markedBuilding && (variantState === 'running' || variantState === 'pending')) {
      state = 'building'
      markedBuilding = true
    }

    const slideNumber = index + 1
    const title =
      planSlide?.title_intent?.trim() ||
      planSlide?.key_message?.trim() ||
      variantSlide?.title?.trim() ||
      `Слайд ${formatIndex(slideNumber)}`
    const purpose = planSlide?.purpose ?? variantSlide?.purpose ?? null

    return {
      key: planSlide?.id ?? variantSlide?.id ?? `slot-${index}`,
      index,
      slideNumber,
      slideId,
      title,
      purposeLabel: slidePurposeLabel(purpose),
      previewArtifactId,
      imageUrl,
      state,
    }
  })
}

export function latestAssistantNote(
  events: readonly JobEvent[],
  variantId?: string | null,
  totalSlides?: number,
): string | null {
  if (events.length === 0) return null

  const readyCount = collectReadyEvents(events, variantId).length

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (!event) continue
    if (!matchesVariant(event, variantId)) continue
    const note = readString(event, 'assistant_note')
    if (note) return note
    if (event.type === 'slide.ready' && readyCount > 0) {
      const total = totalSlides && totalSlides > 0 ? totalSlides : readyCount
      return `Собираю ${readyCount} из ${total}…`
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (!event) continue
    const note = readString(event, 'assistant_note')
    if (note) return note
  }

  return null
}

export function extractEventGenerationId(events: readonly JobEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (!event) continue
    const genId = readString(event, 'generation_id')
    if (genId) return genId
  }
  return null
}
