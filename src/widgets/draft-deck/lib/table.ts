import type { Insight, Understanding, UnderstandingBlock, UnderstandingDataset } from '@/entities/assistant'
import { pluralize } from '@/shared/lib/format'
import { isInsightRecommendation } from './understanding'

export interface InsightEntry {
  insight: Insight
  dataset: UnderstandingDataset
  preview: UnderstandingBlock['preview']
  first: boolean
}

export function insightTitle(insight: Insight): string {
  return (insight.headline || insight.fact || '').trim()
}

export function needsDecision(insight: Insight): boolean {
  return isInsightRecommendation(insight) && !insight.confirmed
}

export function insightEntries(understanding: Understanding): InsightEntry[] {
  return understanding.datasets.flatMap((dataset) => {
    const preview = understanding.blocks.find((block) => block.dataset_id === dataset.id && block.preview)?.preview ?? null
    return dataset.insights.map((insight, index) => ({ insight, dataset, preview, first: index === 0 }))
  })
}

export function textBlocks(understanding: Understanding): UnderstandingBlock[] {
  return understanding.blocks.filter((block) => !block.dataset_id && (block.title || block.text))
}

export function blockTitle(block: UnderstandingBlock): string {
  const title = block.title?.trim()
  if (title) return title
  const text = (block.text ?? '').trim()
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text
  return sentence.length > 120 ? `${sentence.slice(0, 117)}…` : sentence
}

export function stepNote(understanding: Understanding): string {
  const insights = insightEntries(understanding)
  const pending = insights.filter((entry) => needsDecision(entry.insight)).length
  const blocks = textBlocks(understanding).length
  const capacity = understanding.summary.capacity_slides ?? 0
  const parts: string[] = []
  if (insights.length) parts.push(`${insights.length} ${pluralize(insights.length, ['вывод', 'вывода', 'выводов'])} из данных`)
  if (blocks) parts.push(`${blocks} ${pluralize(blocks, ['мысль', 'мысли', 'мыслей'])} из текста`)
  const found = parts.length ? `Нашёл ${parts.join(' и ')}.` : 'Материала пока мало.'
  const room = capacity > 0 ? ` Хватит примерно на ${capacity} ${pluralize(capacity, ['слайд', 'слайда', 'слайдов'])}.` : ''
  const ask = pending ? ` ${pending} ${pluralize(pending, ['предложение ждёт', 'предложения ждут', 'предложений ждут'])} вашего решения — нажмите на слайд.` : ' Нажмите на слайд, чтобы поправить.'
  return `${found}${room}${ask}`
}

export function keyFigure(text: string): string | null {
  const times = /в\s+(\d+(?:[.,]\d+)?)\s+раз/i.exec(text)
  if (times) return `×${times[1]}`
  const share = /(\d+(?:[.,]\d+)?)\s?%/.exec(text)
  if (share) return `${share[1]}%`
  const money = /(\d+(?:[.,]\d+)?)\s?(млн|млрд|тыс)/i.exec(text)
  if (money) return `${money[1]} ${money[2]}`
  return null
}
