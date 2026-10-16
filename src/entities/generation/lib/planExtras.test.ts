import { applyPlanEvent, EMPTY_PROGRESS, isUnitLocked, parseSse, parseSufficiency, unitOrigin, unitSourceId } from './planExtras'

const slide = { id: 's1', index: 0, purpose: 'custom', title_intent: 'Рынок растёт', key_message: '', evidence_ids: ['p:meta'], content_units: [], density_budget: { level: 'medium' } }

describe('plan extras', () => {
  it('ignores sufficiency with an unknown status', () => {
    expect(parseSufficiency({ status: 'plenty' })).toBeNull()
    expect(parseSufficiency({ status: 'excess', supported_slides: 18, target_slide_count: 10 })).toEqual({ status: 'excess', contentSlides: 18, targetSlides: 10 })
  })

  it('maps unit origins to user, web and model', () => {
    expect(unitOrigin({ origin: 'user' })).toBe('user')
    expect(unitOrigin({ origin: { kind: 'web', source_id: 'src-1' } })).toBe('web')
    expect(unitOrigin({ origin: 'llm' })).toBe('model')
    expect(unitOrigin({})).toBeNull()
    expect(unitSourceId({ origin: { kind: 'web', source_id: 'src-1' } })).toBe('src-1')
    expect(unitSourceId({ source_id: 'src-2' })).toBe('src-2')
    expect(isUnitLocked({ locked: true })).toBe(true)
    expect(isUnitLocked({})).toBe(false)
  })

  it('accumulates queries, sources and slides from job events', () => {
    let progress = applyPlanEvent(EMPTY_PROGRESS, 'stage.started', { stage: 'research' })
    progress = applyPlanEvent(progress, 'research.query', { query: 'рынок' })
    progress = applyPlanEvent(progress, 'research.query', { query: 'рынок' })
    progress = applyPlanEvent(progress, 'research.source', { source: { id: 'a', title: 'Отчёт', url: 'https://example.com' } })
    progress = applyPlanEvent(progress, 'plan.slide', { slide })
    progress = applyPlanEvent(progress, 'plan.slide', { slide: { ...slide, title_intent: 'Рынок растёт на 30%' } })
    expect(progress.stage).toBe('research')
    expect(progress.queries).toEqual(['рынок'])
    expect(progress.sources.map((source) => source.site)).toEqual(['example.com'])
    expect(progress.slides.map((item) => item.title_intent)).toEqual(['Рынок растёт на 30%'])
    expect(applyPlanEvent(progress, 'plan.slide', { slide: { id: 'x' } })).toBe(progress)
  })

  it('parses a server-sent event stream', () => {
    const text = 'id: 1\nevent: research.query\ndata: {"query":"a"}\n\nid: 2\nevent: job.completed\ndata: {"state":"completed"}\n\n: keepalive\n\n'
    expect(parseSse(text)).toEqual([
      { id: 1, type: 'research.query', data: { query: 'a' } },
      { id: 2, type: 'job.completed', data: { state: 'completed' } },
    ])
  })
})
