import type { JobEvent } from '@/entities/assistant'
import type { DeckPlan, SlideDraftItem } from '@/entities/generation'
import { buildFilmstripSlots, buildStageSummary, latestAssistantNote } from './filmstrip'

const plan: DeckPlan = {
  id: 'plan_1',
  content_pack_id: 'pack_1',
  audience: 'Совет директоров',
  language: 'ru',
  slides: [
    {
      id: 'slide-0',
      index: 0,
      section_id: 'sec-1',
      purpose: 'title',
      title_intent: 'Итоги года',
      key_message: 'Ключевые показатели выросли вдвое',
      content_units: [{ id: 'u1', kind: 'bullet', role: 'bullet', text: 'Выручка +110% за год' }],
    },
    {
      id: 'slide-1',
      index: 1,
      section_id: 'sec-1',
      purpose: 'metrics',
      title_intent: 'Динамика продаж',
      key_message: 'Рост во всех регионах',
      content_units: [{ id: 'u2', kind: 'bullet', role: 'bullet', text: 'B2B сегмент дал 64% прироста' }],
    },
    {
      id: 'slide-2',
      index: 2,
      section_id: 'sec-1',
      purpose: 'summary',
      title_intent: 'План на 2026 год',
      key_message: 'Масштабирование линейки',
      content_units: [],
    },
  ],
  sections: [{ id: 'sec-1', title: 'Основная часть', slide_ids: ['slide-0', 'slide-1', 'slide-2'] }],
} as unknown as DeckPlan

function makeEvent(sequence: number, type: string, data: Record<string, unknown>): JobEvent {
  return {
    sequence,
    type,
    timestamp: '2026-10-18T12:00:00Z',
    jobId: 'job_1',
    stage: null,
    progress: null,
    message: null,
    data,
  }
}

describe('buildFilmstripSlots progressive previews', () => {
  it('progresses a slide from plan card to draft (preview_revision=1), superseded, and final PNG (preview_revision=2) via slide_key', () => {
    const initial = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      events: [],
    })
    expect(initial).toHaveLength(3)
    expect(initial[0]?.state).toBe('building')
    expect(initial[0]?.imageUrl).toBeNull()
    expect(initial[0]?.previewBadge).toBeNull()
    expect(initial[1]?.state).toBe('draft')

    const withDraft = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      events: [
        makeEvent(1, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'draft',
          preview_artifact_id: 'art_draft_1',
        }),
      ],
    })
    expect(withDraft[0]?.state).toBe('ready')
    expect(withDraft[0]?.imageUrl).toContain('art_draft_1')
    expect(withDraft[0]?.previewBadge).toBe('черновик')
    expect(withDraft[1]?.state).toBe('building')

    const withSuperseded = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      events: [
        makeEvent(1, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'draft',
          preview_artifact_id: 'art_draft_1',
        }),
        makeEvent(2, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'superseded',
        }),
      ],
    })
    expect(withSuperseded[0]?.state).toBe('ready')
    expect(withSuperseded[0]?.imageUrl).toContain('art_draft_1')
    expect(withSuperseded[0]?.previewBadge).toBe('обновляется')

    const withFinal = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      events: [
        makeEvent(1, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'draft',
          preview_artifact_id: 'art_draft_1',
        }),
        makeEvent(2, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'superseded',
        }),
        makeEvent(3, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 2,
          status: 'rendered',
          preview_artifact_id: 'art_final_1',
        }),
      ],
    })
    expect(withFinal[0]?.state).toBe('ready')
    expect(withFinal[0]?.imageUrl).toContain('art_final_1')
    expect(withFinal[0]?.previewBadge).toBeNull()
    expect(withFinal[0]?.previewRevision).toBe(2)
  })

  it('restores slide previews from GET /variants/{id}/slide-drafts after refresh and merges subsequent SSE events', () => {
    const slideDrafts: SlideDraftItem[] = [
      {
        variant_id: 'var_balanced',
        index: 1,
        slide_id: 'slide-0',
        slide_key: 'var_balanced:1',
        revision: 1,
        preview_revision: 2,
        preview_artifact_id: 'art_s1_final',
        status: 'rendered',
      },
      {
        variant_id: 'var_balanced',
        index: 2,
        slide_id: 'slide-1',
        slide_key: 'var_balanced:2',
        revision: 1,
        preview_revision: 1,
        preview_artifact_id: 'art_s2_draft',
        status: 'draft',
      },
    ]

    const restored = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      slideDrafts,
      events: [],
    })

    expect(restored[0]?.imageUrl).toContain('art_s1_final')
    expect(restored[0]?.previewBadge).toBeNull()
    expect(restored[1]?.imageUrl).toContain('art_s2_draft')
    expect(restored[1]?.previewBadge).toBe('черновик')
    expect(restored[2]?.imageUrl).toBeNull()
    expect(restored[2]?.state).toBe('building')

    const afterRefreshEvents = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      slideDrafts,
      events: [
        makeEvent(15, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:2',
          index: 2,
          slide_id: 'slide-1',
          preview_revision: 2,
          status: 'rendered',
          preview_artifact_id: 'art_s2_final',
        }),
      ],
    })

    expect(afterRefreshEvents[1]?.imageUrl).toContain('art_s2_final')
    expect(afterRefreshEvents[1]?.previewBadge).toBeNull()
  })
})

describe('buildStageSummary', () => {
  it('computes stages for running and completed states', () => {
    const slots = buildFilmstripSlots({
      plan,
      variantId: 'var_balanced',
      variantState: 'running',
      events: [
        makeEvent(1, 'slide.ready', {
          variant_id: 'var_balanced',
          slide_key: 'var_balanced:1',
          index: 1,
          slide_id: 'slide-0',
          preview_revision: 1,
          status: 'draft',
          preview_artifact_id: 'art_draft_1',
        }),
      ],
    })

    const runningSummary = buildStageSummary({
      phase: 'running',
      stage: 'render',
      cardState: 'running',
      slots,
      hasPlan: true,
    })

    expect(runningSummary.stages[0]).toEqual({ id: 'plan', label: 'План', statusLabel: 'готово', state: 'done' })
    expect(runningSummary.stages[1]).toEqual({ id: 'slides', label: 'Слайды 1 из 3', statusLabel: 'черновик', state: 'active' })
    expect(runningSummary.stages[2]).toEqual({ id: 'audit', label: 'Проверка', statusLabel: 'ожидает', state: 'pending' })

    const completedSummary = buildStageSummary({
      phase: 'completed',
      stage: null,
      cardState: 'done',
      slots: buildFilmstripSlots({ plan, variantId: 'var_balanced', variantState: 'done' }),
      hasPlan: true,
    })

    expect(completedSummary.stages[0]?.state).toBe('done')
    expect(completedSummary.stages[1]).toEqual({ id: 'slides', label: 'Слайды 3 из 3', statusLabel: 'готово', state: 'done' })
    expect(completedSummary.stages[2]).toEqual({ id: 'audit', label: 'Проверка', statusLabel: 'готово', state: 'done' })
  })
})

describe('latestAssistantNote', () => {
  it('counts ready slides per deck when all three variants build together', () => {
    const events: JobEvent[] = []
    let sequence = 1
    for (const variant of ['var_a', 'var_b', 'var_c']) {
      for (let index = 0; index < 3; index += 1) {
        events.push(makeEvent(sequence, 'slide.ready', { variant_id: variant, slide_key: `${variant}:${index}`, preview_artifact_id: `art_${sequence}` }))
        sequence += 1
      }
    }

    expect(latestAssistantNote(events, null, 3)).toBe('Собираю 3 из 3…')
    expect(latestAssistantNote(events.slice(0, 4), null, 3)).toBe('Собираю 3 из 3…')
    expect(latestAssistantNote(events.slice(0, 2), 'var_a', 3)).toBe('Собираю 2 из 3…')
  })
})
