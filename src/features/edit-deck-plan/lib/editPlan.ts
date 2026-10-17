import { isEditableUnit, type ContentUnit, type DeckPlan, type SlidePlan } from '@/entities/generation'

export interface SlidePatch {
  title_intent?: string
  key_message?: string
  desired_visual?: SlidePlan['desired_visual']
}

export type EditableUnit = ContentUnit

function ordered(plan: DeckPlan): SlidePlan[] {
  return [...plan.slides].sort((a, b) => a.index - b.index)
}

function withSlides(plan: DeckPlan, slides: readonly SlidePlan[]): DeckPlan {
  const ids = new Set(slides.map((slide) => slide.id))
  return {
    ...plan,
    slides: slides.map((slide, index) => (slide.index === index ? slide : { ...slide, index })),
    sections: plan.sections?.map((section) => ({ ...section, slide_ids: section.slide_ids.filter((id) => ids.has(id)) })),
  }
}

function mapSlide(plan: DeckPlan, slideId: string, edit: (slide: SlidePlan) => SlidePlan): DeckPlan {
  let changed = false
  const slides = ordered(plan).map((slide) => {
    if (slide.id !== slideId) return slide
    const next = edit(slide)
    if (next !== slide) changed = true
    return next
  })
  return changed ? withSlides(plan, slides) : plan
}

export function moveSlide(plan: DeckPlan, slideId: string, delta: -1 | 1): DeckPlan {
  const slides = ordered(plan)
  const from = slides.findIndex((slide) => slide.id === slideId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= slides.length) return plan
  const next = [...slides]
  const [moved] = next.splice(from, 1)
  if (moved) next.splice(to, 0, moved)
  return withSlides(plan, next)
}

export function removeSlide(plan: DeckPlan, slideId: string): DeckPlan {
  const slides = ordered(plan)
  if (slides.length <= 1 || !slides.some((slide) => slide.id === slideId)) return plan
  return withSlides(
    plan,
    slides.filter((slide) => slide.id !== slideId),
  )
}

export function updateSlide(plan: DeckPlan, slideId: string, patch: SlidePatch): DeckPlan {
  return mapSlide(plan, slideId, (slide) => {
    const next = { ...slide, ...patch }
    const changed = next.title_intent !== slide.title_intent || next.key_message !== slide.key_message || next.desired_visual !== slide.desired_visual
    return changed ? next : slide
  })
}

function editUnits(plan: DeckPlan, slideId: string, edit: (units: EditableUnit[]) => EditableUnit[] | null): DeckPlan {
  return mapSlide(plan, slideId, (slide) => {
    const units = edit([...slide.content_units])
    return units ? { ...slide, content_units: units } : slide
  })
}

export function updateUnit(plan: DeckPlan, slideId: string, position: number, text: string): DeckPlan {
  return editUnits(plan, slideId, (units) => {
    const unit = units[position]
    if (!unit || !isEditableUnit(unit) || unit.text === text) return null
    units[position] = { ...unit, text, locked: true }
    return units
  })
}

export function addUnit(plan: DeckPlan, slideId: string, text = ''): DeckPlan {
  return editUnits(plan, slideId, (units) => [...units, { role: 'bullet', kind: 'bullet', text, locked: true }])
}

export function removeUnit(plan: DeckPlan, slideId: string, position: number): DeckPlan {
  return editUnits(plan, slideId, (units) => {
    const unit = units[position]
    if (!unit || !isEditableUnit(unit)) return null
    units.splice(position, 1)
    return units
  })
}

export function moveUnit(plan: DeckPlan, slideId: string, position: number, delta: -1 | 1): DeckPlan {
  return editUnits(plan, slideId, (units) => {
    const editable = units.map((unit, index) => (isEditableUnit(unit) ? index : -1)).filter((index) => index >= 0)
    const at = editable.indexOf(position)
    const target = editable[at + delta]
    if (at < 0 || target === undefined) return null
    const current = units[position]
    const other = units[target]
    if (!current || !other) return null
    units[position] = other
    units[target] = current
    return units
  })
}

function uniqueId(plan: DeckPlan): string {
  const taken = new Set(plan.slides.map((slide) => slide.id))
  let counter = plan.slides.length + 1
  while (taken.has(`slide-user-${counter}`)) counter += 1
  return `slide-user-${counter}`
}

export function addSlide(plan: DeckPlan, title = 'Новый слайд'): DeckPlan {
  const slide: SlidePlan = {
    id: uniqueId(plan),
    index: plan.slides.length,
    purpose: 'custom',
    title_intent: title,
    key_message: '',
    evidence_ids: [],
    content_units: [],
    density_budget: { level: 'medium' },
    desired_visual: 'none',
    mandatory: false,
  }
  return withSlides(plan, [...ordered(plan), slide])
}

function unitSignature(slide: SlidePlan): unknown[] {
  return slide.content_units.map((unit) => [unit.kind, unit.text ?? null])
}

function slideSignature(slide: SlidePlan): unknown[] {
  return [slide.id, slide.title_intent, slide.key_message, slide.desired_visual ?? null, unitSignature(slide)]
}

function signature(plan: DeckPlan): string {
  return JSON.stringify(ordered(plan).map(slideSignature))
}

export function isPlanEdited(base: DeckPlan, draft: DeckPlan): boolean {
  return signature(base) !== signature(draft)
}

export function editSummary(base: DeckPlan, draft: DeckPlan): { removed: number; added: number; renamed: number; moved: boolean } {
  const before = new Map(base.slides.map((slide) => [slide.id, slide]))
  const after = new Map(draft.slides.map((slide) => [slide.id, slide]))
  const removed = [...before.keys()].filter((id) => !after.has(id)).length
  const added = [...after.keys()].filter((id) => !before.has(id)).length
  const renamed = [...after.values()].filter((slide) => {
    const original = before.get(slide.id)
    return original !== undefined && JSON.stringify(slideSignature(original)) !== JSON.stringify(slideSignature(slide))
  }).length
  const kept = (plan: DeckPlan) =>
    ordered(plan)
      .map((slide) => slide.id)
      .filter((id) => before.has(id) && after.has(id))
      .join('|')
  return { removed, added, renamed, moved: kept(base) !== kept(draft) }
}

function fallbackEvidence(plan: DeckPlan): string | null {
  const refs = plan.slides.flatMap((slide) => slide.evidence_ids)
  const meta = refs.find((ref) => ref.endsWith(':meta'))
  if (meta) return meta
  const pack = refs.map((ref) => ref.split(':')).find((parts) => parts.length > 1)?.[0]
  return pack ? `${pack}:meta` : (refs[0] ?? null)
}

export interface BuildOptions {
  lockAll?: boolean
}

export function prepareForBuild(plan: DeckPlan, { lockAll = false }: BuildOptions = {}): DeckPlan {
  const evidence = fallbackEvidence(plan)
  const slides = ordered(plan).map((slide) => {
    const units = slide.content_units
      .filter((unit) => !(isEditableUnit(unit) && (unit.text ?? '').trim() === ''))
      .map((unit) => (lockAll && isEditableUnit(unit) ? { ...unit, locked: true } : unit))
    const missingEvidence = slide.evidence_ids.length === 0 && evidence !== null
    const unitsChanged = units.length !== slide.content_units.length || units.some((unit, index) => unit !== slide.content_units[index])
    if (!missingEvidence && !unitsChanged) return slide
    return { ...slide, content_units: units, evidence_ids: missingEvidence ? [evidence] : slide.evidence_ids }
  })
  return withSlides(plan, slides)
}
