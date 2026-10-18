import type { Insight, Understanding, UnderstandingBlock, UnderstandingDataset } from '@/entities/assistant'
import { datasetGroups, insightSource, profileFacts, stepNote } from './table'

function block(patch: Partial<UnderstandingBlock> = {}): UnderstandingBlock {
  return {
    id: 'b:s1:0',
    kind: 'fact',
    title: null,
    text: 'Текст блока',
    source_ref: null,
    dataset_id: null,
    preview: null,
    ...patch,
  }
}

function insight(patch: Partial<Insight> = {}): Insight {
  return {
    id: 'i-1',
    dataset_id: 'ds-1',
    kind: 'fact',
    fact: 'Выручка выросла в 2,1 раза',
    headline: null,
    meaning: null,
    implication: null,
    strength: 0.9,
    confirmed: false,
    needs_confirmation: false,
    evidence: [],
    numbers: [],
    ...patch,
  }
}

function dataset(patch: Partial<UnderstandingDataset> = {}): UnderstandingDataset {
  return {
    id: 'ds-1',
    title: 'Продажи',
    file: 'purchases.csv',
    profile_summary: '8755 строк; 6 колонок; период 01.10.2024 – 30.09.2026; есть пропуски: Регион, Канал',
    task: 'trend',
    task_ru: 'Динамика',
    recommendations: [],
    why: null,
    insights: [insight()],
    ...patch,
  }
}

function understanding(patch: Partial<Understanding> = {}): Understanding {
  return {
    content_pack_id: 'pack-1',
    blocks: [block()],
    summary: { capacity_slides: 6, main_points: ['Рост выручки'], assistant_note: null },
    datasets: [dataset()],
    brief: {},
    context: null,
    interpretation: null,
    assistant_note: null,
    ...patch,
  }
}

describe('datasetGroups', () => {
  it('joins each dataset with its preview block and insights', () => {
    const preview = { chart_type: 'line', categories: ['окт'], series: [{ name: 'Выручка', values: [1] }], unit: 'млн ₽' }
    const data = understanding({
      blocks: [block(), block({ id: 'ds:ds-1', kind: 'data', dataset_id: 'ds-1', preview })],
      datasets: [dataset({ insights: [insight({ id: 'i-1' }), insight({ id: 'i-2' })] })],
    })
    const groups = datasetGroups(data)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.dataset.id).toBe('ds-1')
    expect(groups[0]?.preview).toEqual(preview)
    expect(groups[0]?.entries.map((entry) => entry.insight.id)).toEqual(['i-1', 'i-2'])
    expect(groups[0]?.entries[0]?.dataset.id).toBe('ds-1')
  })

  it('returns null preview when the dataset has no preview block', () => {
    const groups = datasetGroups(understanding())
    expect(groups[0]?.preview).toBeNull()
  })
})

describe('profileFacts', () => {
  it('splits the profile summary into chips and shortens the gaps note', () => {
    expect(profileFacts('8755 строк; 6 колонок; период 01.10.2024 – 30.09.2026; метрики: Сумма; есть пропуски: Регион, Канал')).toEqual([
      '8755 строк',
      '6 колонок',
      'период 01.10.2024 – 30.09.2026',
      'метрики: Сумма',
      'пропуски: Регион, Канал',
    ])
  })

  it('returns an empty list without a profile', () => {
    expect(profileFacts(null)).toEqual([])
    expect(profileFacts('')).toEqual([])
  })
})

describe('insightSource', () => {
  it('joins evidence rows and falls back to the dataset file', () => {
    const withEvidence = insight({ evidence: ['purchases.csv · Сумма, ₽, строки 2–8756', 'purchases.csv · Дата, строки 2–8756', 'лишнее'] })
    expect(insightSource(withEvidence, dataset())).toBe('purchases.csv · Сумма, ₽, строки 2–8756 · purchases.csv · Дата, строки 2–8756')
    expect(insightSource(insight(), dataset())).toBe('purchases.csv')
  })
})

describe('stepNote', () => {
  it('mentions excluded insights', () => {
    const note = stepNote(understanding(), 2)
    expect(note).toContain('2 вывода не включу')
  })

  it('guides to card actions', () => {
    const note = stepNote(understanding())
    expect(note).toContain('вывод')
    expect(note).toContain('слайд')
  })
})
