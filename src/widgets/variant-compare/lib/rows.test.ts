import { describe, expect, it } from 'vitest'
import { alignRows } from './rows'

const slide = (variant: string, index: number) => ({ id: `${variant}-${index}`, index })

describe('alignRows', () => {
  it('aligns equal-length decks row by row', () => {
    const rows = alignRows([
      [slide('a', 0), slide('a', 1)],
      [slide('b', 0), slide('b', 1)],
      [slide('c', 0), slide('c', 1)],
    ])
    expect(rows.map((row) => row.index)).toEqual([0, 1])
    expect(rows[1]?.cells.map((cell) => cell?.id)).toEqual(['a-1', 'b-1', 'c-1'])
  })

  it('pads shorter decks with empty cells up to the longest deck', () => {
    const rows = alignRows([[slide('a', 0)], [slide('b', 0), slide('b', 1), slide('b', 2)], [slide('c', 0), slide('c', 1)]])
    expect(rows).toHaveLength(3)
    expect(rows[2]?.cells.map((cell) => cell?.id ?? null)).toEqual([null, 'b-2', null])
    expect(rows[1]?.cells.map((cell) => cell?.id ?? null)).toEqual([null, 'b-1', 'c-1'])
  })

  it('aligns by slide index rather than array position and sorts rows', () => {
    const rows = alignRows([[slide('a', 2), slide('a', 0)], [slide('b', 1)]])
    expect(rows.map((row) => row.index)).toEqual([0, 1, 2])
    expect(rows[0]?.cells.map((cell) => cell?.id ?? null)).toEqual(['a-0', null])
    expect(rows[1]?.cells.map((cell) => cell?.id ?? null)).toEqual([null, 'b-1'])
  })

  it('keeps a column for decks that are still loading', () => {
    const rows = alignRows([undefined, [slide('b', 0)], null])
    expect(rows).toEqual([{ index: 0, cells: [null, { id: 'b-0', index: 0 }, null] }])
  })

  it('returns no rows when nothing is loaded', () => {
    expect(alignRows([undefined, [], null])).toEqual([])
  })
})
