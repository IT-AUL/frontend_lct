export interface AlignedRow<T> {
  index: number
  cells: (T | null)[]
}

export function alignRows<T extends { index: number }>(columns: readonly (readonly T[] | null | undefined)[]): AlignedRow<T>[] {
  const byIndex = columns.map((slides) => new Map((slides ?? []).map((slide) => [slide.index, slide])))
  const indexes = new Set<number>()
  for (const column of byIndex) for (const index of column.keys()) indexes.add(index)
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({ index, cells: byIndex.map((column) => column.get(index) ?? null) }))
}
