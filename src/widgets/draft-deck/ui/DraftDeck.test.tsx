import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Insight, Understanding, UnderstandingBlock, UnderstandingDataset } from '@/entities/assistant'
import { DraftDeck } from './DraftDeck'

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
    recommendations: [{ chart_type: 'line', score: 1.25, reasons: [] }],
    why: null,
    insights: [insight()],
    ...patch,
  }
}

const preview = { chart_type: 'line', categories: ['окт', 'ноя', 'дек'], series: [{ name: 'Выручка', values: [1, 2, 3] }], unit: 'млн ₽' }

function understanding(patch: Partial<Understanding> = {}): Understanding {
  return {
    content_pack_id: 'pack-1',
    blocks: [block({ id: 'ds:ds-1', kind: 'data', dataset_id: 'ds-1', preview, title: 'Продажи' }), block()],
    summary: { capacity_slides: 6, main_points: ['Рост выручки'], assistant_note: null },
    datasets: [dataset()],
    brief: {},
    context: null,
    interpretation: null,
    assistant_note: null,
    ...patch,
  }
}

describe('DraftDeck', () => {
  it('shows the dataset profile and a rich insight card', () => {
    const data = understanding({
      datasets: [
        dataset({
          insights: [
            insight({
              headline: 'Выручка: рост в 2,1 раза',
              fact: 'Выручка: с 1,2 млн ₽ до 2,5 млн ₽',
              meaning: 'Рост ускорился во втором полугодии',
              implication: 'Сделать ставку на электронику',
              evidence: ['purchases.csv · Сумма, строки 2–8756'],
            }),
          ],
        }),
      ],
    })
    render(<DraftDeck understanding={data} selection={null} />)

    const list = screen.getByRole('list', { name: 'Выводы из данных' })
    expect(list).toBeInTheDocument()
    expect(screen.getByText('8755 строк')).toBeInTheDocument()
    expect(screen.getByText('6 колонок')).toBeInTheDocument()
    expect(screen.getByText(/период 01\.10\.2024/)).toBeInTheDocument()
    expect(screen.getByText('пропуски: Регион, Канал')).toBeInTheDocument()

    const card = screen.getByRole('listitem', { name: /Вывод: Выручка: рост в 2,1 раза/ })
    expect(within(card).getByText('Выручка: с 1,2 млн ₽ до 2,5 млн ₽')).toBeInTheDocument()
    expect(within(card).getByText('Значит')).toBeInTheDocument()
    expect(within(card).getByText('Рост ускорился во втором полугодии')).toBeInTheDocument()
    expect(within(card).getByText('Следует')).toBeInTheDocument()
    expect(within(card).getByText('Сделать ставку на электронику')).toBeInTheDocument()
    expect(within(card).getByText(/purchases\.csv · Сумма, строки 2–8756/)).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'График: Продажи' })).toBeInTheDocument()
  })

  it('renders a mini chart on every data insight, not only the first', () => {
    const data = understanding({
      datasets: [dataset({ insights: [insight({ id: 'i-1', headline: 'Первый' }), insight({ id: 'i-2', headline: 'Второй' })] })],
    })
    render(<DraftDeck understanding={data} selection={null} />)
    expect(screen.getAllByRole('img', { name: 'График: Продажи' })).toHaveLength(2)
  })

  it('fires card actions', async () => {
    const user = userEvent.setup()
    const onPatch = vi.fn()
    const onExclude = vi.fn()
    const onSelect = vi.fn()
    render(<DraftDeck understanding={understanding()} selection={null} onSelect={onSelect} onPatchInsight={onPatch} onExcludeInsight={onExclude} />)
    const card = screen.getByRole('listitem', { name: /Вывод:/ })

    await user.click(within(card).getByRole('button', { name: 'Согласен' }))
    expect(onPatch).toHaveBeenCalledWith('i-1', { confirmed: true })

    await user.click(within(card).getByRole('button', { name: 'Изменить' }))
    expect(onSelect).toHaveBeenCalledWith({ kind: 'insight', id: 'i-1', edit: true })

    await user.click(within(card).getByRole('button', { name: 'Не включать' }))
    expect(onExclude).toHaveBeenCalledWith('i-1')
  })

  it('moves excluded insights to the excluded strip and restores them', async () => {
    const user = userEvent.setup()
    const onInclude = vi.fn()
    const data = understanding({
      datasets: [dataset({ insights: [insight({ id: 'i-1', headline: 'Оставить' }), insight({ id: 'i-2', headline: 'Убрать' })] })],
    })
    render(<DraftDeck understanding={data} selection={null} excludedInsightIds={['i-2']} onIncludeInsight={onInclude} />)

    expect(screen.queryByRole('listitem', { name: /Вывод: Убрать/ })).not.toBeInTheDocument()
    const strip = screen.getByRole('group', { name: 'Исключённые выводы' })
    expect(within(strip).getByText('Убрать')).toBeInTheDocument()
    await user.click(within(strip).getByRole('button', { name: 'Вернуть' }))
    expect(onInclude).toHaveBeenCalledWith('i-2')
  })

  it('shows text blocks as a compact separate group with remove action', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const data = understanding({ blocks: [block({ id: 'ds:ds-1', kind: 'data', dataset_id: 'ds-1', preview }), block({ id: 'b:s1:1', text: 'Мысль автора' })] })
    render(<DraftDeck understanding={data} selection={null} onRemoveBlock={onRemove} />)

    const thoughts = screen.getByRole('list', { name: 'Мысли из текста' })
    const card = within(thoughts).getByRole('listitem', { name: /Блок:/ })
    expect(card).toHaveTextContent('Мысль автора')
    await user.click(within(card).getByRole('button', { name: 'Не включать' }))
    expect(onRemove).toHaveBeenCalledWith('b:s1:1')
  })

  it('hides actions in quiet mode', () => {
    render(<DraftDeck understanding={understanding()} selection={null} quiet />)
    const card = screen.getByRole('listitem', { name: /Вывод:/ })
    expect(within(card).queryByRole('button', { name: 'Согласен' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Не включать' })).not.toBeInTheDocument()
  })
})
