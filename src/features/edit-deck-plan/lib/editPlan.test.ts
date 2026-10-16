import { generationFixture } from '@/shared/api/mocks'
import type { DeckPlan } from '@/entities/generation'
import { addSlide, addUnit, editSummary, isPlanEdited, moveSlide, moveUnit, prepareForBuild, removeSlide, removeUnit, updateSlide, updateUnit } from './editPlan'

const plan = generationFixture.deck_plan as DeckPlan
const ids = (target: DeckPlan) => [...target.slides].sort((a, b) => a.index - b.index).map((slide) => slide.id)
const [first = '', second = ''] = ids(plan)

describe('editPlan', () => {
  it('moves a slide and keeps indexes contiguous', () => {
    const moved = moveSlide(plan, first, 1)
    expect(ids(moved).slice(0, 2)).toEqual([second, first])
    expect(moved.slides.map((slide) => slide.index)).toEqual(moved.slides.map((_, index) => index))
    expect(moveSlide(plan, first, -1)).toBe(plan)
  })

  it('removes a slide from the plan and its sections', () => {
    const removed = removeSlide(plan, first)
    expect(ids(removed)).not.toContain(first)
    expect(removed.sections?.flatMap((section) => section.slide_ids)).not.toContain(first)
    expect(editSummary(plan, removed)).toMatchObject({ removed: 1, added: 0 })
  })

  it('never removes the last slide', () => {
    const single = { ...plan, slides: plan.slides.slice(0, 1) }
    expect(removeSlide(single, single.slides[0]?.id ?? '')).toBe(single)
  })

  it('edits titles and messages and reports the plan as edited', () => {
    const edited = updateSlide(plan, first, { title_intent: 'Рынок растёт на 30% в год' })
    expect(edited.slides.find((slide) => slide.id === first)?.title_intent).toBe('Рынок растёт на 30% в год')
    expect(isPlanEdited(plan, edited)).toBe(true)
    expect(editSummary(plan, edited).renamed).toBe(1)
    expect(updateSlide(plan, first, {})).toBe(plan)
  })

  it('adds a valid slide with a unique id at the end', () => {
    const added = addSlide(addSlide(plan))
    const extra = ids(added).slice(-2)
    expect(new Set(extra).size).toBe(2)
    expect(added.slides.find((slide) => slide.id === extra[1])).toMatchObject({ purpose: 'custom', density_budget: { level: 'medium' }, index: plan.slides.length + 1 })
    expect(isPlanEdited(plan, moveSlide(moveSlide(plan, first, 1), first, -1))).toBe(false)
  })

  it('edits, adds, reorders and removes points and locks what the user wrote', () => {
    const target = plan.slides.find((slide) => slide.content_units.some((unit) => unit.kind === 'bullet'))
    if (!target) throw new Error('fixture has no bullets')
    const position = target.content_units.findIndex((unit) => unit.kind === 'bullet')
    const edited = updateUnit(plan, target.id, position, 'Своя формулировка')
    const unit = edited.slides.find((slide) => slide.id === target.id)?.content_units[position]
    expect(unit).toMatchObject({ text: 'Своя формулировка', locked: true })
    expect(isPlanEdited(plan, edited)).toBe(true)
    expect(editSummary(plan, edited).renamed).toBe(1)

    const added = addUnit(edited, target.id, 'Новый пункт')
    const units = added.slides.find((slide) => slide.id === target.id)?.content_units ?? []
    expect(units.at(-1)).toMatchObject({ kind: 'bullet', text: 'Новый пункт', locked: true })

    const titleIndex = units.findIndex((item) => item.kind === 'title')
    expect(removeUnit(added, target.id, titleIndex)).toBe(added)
    expect(removeUnit(added, target.id, units.length - 1).slides.find((slide) => slide.id === target.id)?.content_units).toHaveLength(units.length - 1)

    const moved = moveUnit(added, target.id, units.length - 1, -1)
    const movedUnits = moved.slides.find((slide) => slide.id === target.id)?.content_units ?? []
    expect(movedUnits.at(-2)?.text).toBe('Новый пункт')
    expect(moveUnit(added, target.id, units.length - 1, 1)).toBe(added)
  })

  it('changes the desired visual', () => {
    const edited = updateSlide(plan, first, { desired_visual: 'table' })
    expect(edited.slides.find((slide) => slide.id === first)?.desired_visual).toBe('table')
    expect(isPlanEdited(plan, edited)).toBe(true)
  })

  it('prepares a valid plan for the service: evidence for new slides, no empty points, optional lock', () => {
    const withSlide = addUnit(addSlide(plan), `slide-user-${plan.slides.length + 1}`)
    const prepared = prepareForBuild(withSlide)
    const extra = prepared.slides.at(-1)
    expect(extra?.evidence_ids).toHaveLength(1)
    expect(extra?.evidence_ids[0]).toMatch(/:meta$/)
    expect(extra?.content_units).toEqual([])
    expect(prepared.slides.every((slide) => slide.evidence_ids.length > 0)).toBe(true)
    const locked = prepareForBuild(plan, { lockAll: true })
    const bullets = locked.slides.flatMap((slide) => slide.content_units).filter((unit) => unit.kind === 'bullet')
    expect(bullets.every((unit) => (unit as { locked?: boolean }).locked === true)).toBe(true)
    expect(locked.slides.flatMap((slide) => slide.content_units).find((unit) => unit.kind === 'title')).not.toHaveProperty('locked')
  })
})
