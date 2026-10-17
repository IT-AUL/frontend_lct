import type { DeckPlan, SlidePlan } from '@/entities/generation'
import dataPlanResponse from '@/shared/api/mocks/fixtures/assistant/data-plan.json'
import { availableQuickActions, buildPlanView, parseSlideChartView, resolveDeckKeyMessage } from './plan'

const dataPlan = dataPlanResponse.body.plans[0]?.deck_plan as DeckPlan
const slides = [...dataPlan.slides].sort((a, b) => a.index - b.index)
const charted = slides.find((slide) => slide.chart) as SlidePlan

describe('parseSlideChartView', () => {
  it('uses the backend explanation and lists the current type first', () => {
    const view = parseSlideChartView(charted)
    expect(view).not.toBeNull()
    expect(view?.type).toBe('line')
    expect(view?.why).toBe((charted.chart as { why?: string }).why)
    expect(view?.options.map((option) => option.type)).toEqual(['line', 'bar', 'table'])
    expect(view?.options[0]).toMatchObject({ active: true, label: 'Линия' })
  })

  it('falls back to reasons when why is missing and dedupes alternatives', () => {
    const slide: SlidePlan = {
      ...charted,
      chart: { type: 'bar', reasons: ['три категории'], alternatives: [{ type: 'bar' }, { type: 'line', reasons: ['тренд'] }] },
    }
    const view = parseSlideChartView(slide)
    expect(view?.why).toBe('Столбцы: три категории.')
    expect(view?.options.map((option) => option.type)).toEqual(['bar', 'line'])
  })

  it('returns null without a chart', () => {
    expect(parseSlideChartView({ chart: null })).toBeNull()
    expect(parseSlideChartView({ chart: { type: '' } })).toBeNull()
  })
})

describe('availableQuickActions', () => {
  it('offers text actions only where they make sense', () => {
    const title = slides[0] as SlidePlan
    expect(availableQuickActions(dataPlan, title.id)).toEqual([])
    const overview = slides[1] as SlidePlan
    const actions = availableQuickActions(dataPlan, overview.id)
    expect(actions).toEqual(expect.arrayContaining(['shorten', 'split', 'merge_next', 'to_chart', 'to_diagram', 'remove']))
    const last = slides[slides.length - 1] as SlidePlan
    expect(availableQuickActions(dataPlan, last.id)).toEqual(['remove'])
  })

  it('hides merge on the last content slide and chart action on charted slides', () => {
    const custom = slides.find((slide) => slide.purpose === 'custom') as SlidePlan
    const actions = availableQuickActions(dataPlan, custom.id)
    expect(actions).not.toContain('merge_next')
    expect(availableQuickActions(dataPlan, charted.id)).not.toContain('to_chart')
  })
})

describe('resolveDeckKeyMessage', () => {
  it('prefers the explicit message, then the brief, then slide messages', () => {
    expect(resolveDeckKeyMessage(dataPlan, '  Своя мысль  ')).toBe('Своя мысль')
    const withBrief = { ...dataPlan, brief: { ...dataPlan.brief, key_message: 'Главная мысль из брифа' } }
    expect(resolveDeckKeyMessage(withBrief, null)).toBe('Главная мысль из брифа')
    expect(resolveDeckKeyMessage(dataPlan, null)).toBe('Выручка: рост в 2,1 раза за 24 месяца')
  })
})

describe('buildPlanView', () => {
  it('carries the chart view and the key-message flag into rows', () => {
    const marked: DeckPlan = {
      ...dataPlan,
      slides: dataPlan.slides.map((slide) => (slide.id === 'slide-6' ? { ...slide, supports_key_message: false } : slide)),
    }
    const view = buildPlanView(marked, new Map())
    const dataRow = view.rows.find((row) => row.id === charted.id)
    expect(dataRow?.chart?.type).toBe('line')
    expect(dataRow?.supportsKeyMessage).toBeNull()
    expect(view.rows.find((row) => row.id === 'slide-6')?.supportsKeyMessage).toBe(false)
  })
})
