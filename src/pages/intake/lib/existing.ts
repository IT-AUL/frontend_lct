import type { IntakeKind } from '@/entities/assistant'

export interface ExistingFile {
  name: string
  kind: IntakeKind
}

export function topicFromBrief(brief: Record<string, unknown> | undefined): string {
  const purpose = typeof brief?.purpose === 'string' ? brief.purpose.trim() : ''
  return /\s/.test(purpose) ? purpose : ''
}

export function existingFiles(input: {
  template: string | null | undefined
  brandbook: string | null | undefined
  datasets: readonly { title?: string | null }[]
  sections: number
}): ExistingFile[] {
  const rows: ExistingFile[] = []
  if (input.template) rows.push({ name: input.template, kind: 'template' })
  for (const dataset of input.datasets) if (dataset.title) rows.push({ name: dataset.title, kind: 'data' })
  if (input.sections > 0 && input.datasets.length === 0) rows.push({ name: 'Текст материалов', kind: 'content' })
  if (input.brandbook) rows.push({ name: input.brandbook, kind: 'brandbook' })
  return rows
}

export function withoutColorCodes(note: string): string {
  return note
    .replace(/,?\s*(?:главный|основной)\s+цвет\s+#[0-9a-f]{3,8}\b/gi, '')
    .replace(/\s*#[0-9a-f]{6}\b/gi, '')
    .replace(/\s+,/g, ',')
    .trim()
}
