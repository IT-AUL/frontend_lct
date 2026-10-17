import { useState } from 'react'
import type { Understanding } from '@/entities/assistant'
import { SlideGrid, SlideTile } from '@/shared/ui'
import { blockTitle, insightEntries, insightTitle, keyFigure, needsDecision, textBlocks } from '../lib/table'
import { MiniChart } from './MiniChart'
import styles from './DraftDeck.module.css'

export type Selection = { kind: 'insight'; id: string } | { kind: 'block'; id: string }

const VISIBLE_BLOCKS = 6

interface DraftDeckProps {
  understanding: Understanding
  selection: Selection | null
  onSelect?: (selection: Selection) => void
  quiet?: boolean
}

export function DraftDeck({ understanding, selection, onSelect, quiet }: DraftDeckProps) {
  const [showAll, setShowAll] = useState(false)
  const insights = insightEntries(understanding)
  const blocks = textBlocks(understanding)
  const visibleBlocks = showAll ? blocks : blocks.slice(0, VISIBLE_BLOCKS)
  const both = insights.length > 0 && blocks.length > 0

  return (
    <div className={styles.table}>
      {insights.length > 0 && (
        <section className={styles.group}>
          {both && <h2 className={styles.groupTitle}>Из ваших данных</h2>}
          <SlideGrid label="Выводы из данных">
            {insights.map(({ insight, dataset, preview, first }) => {
              const title = insightTitle(insight)
              return (
                <div role="listitem" key={insight.id}>
                  <SlideTile
                    title={title}
                    selected={selection?.kind === 'insight' && selection.id === insight.id}
                    onOpen={onSelect ? () => onSelect({ kind: 'insight', id: insight.id }) : undefined}
                    openLabel={`Открыть вывод: ${title}`}
                    muted={quiet}
                    caption={!quiet && needsDecision(insight) ? 'Нужно ваше решение' : null}
                  >
                    {first && preview ? (
                      <MiniChart preview={preview} chartType={dataset.recommendations[0]?.chart_type} label={`График: ${dataset.title ?? ''}`} />
                    ) : keyFigure(title) ? (
                      <span className={styles.figure}>{keyFigure(title)}</span>
                    ) : null}
                  </SlideTile>
                </div>
              )
            })}
          </SlideGrid>
        </section>
      )}

      {blocks.length > 0 && (
        <section className={styles.group}>
          {both && <h2 className={styles.groupTitle}>Из текста</h2>}
          <SlideGrid label="Мысли из текста">
            {visibleBlocks.map((block) => {
              const title = blockTitle(block)
              return (
                <div role="listitem" key={block.id}>
                  <SlideTile
                    title={title}
                    selected={selection?.kind === 'block' && selection.id === block.id}
                    onOpen={onSelect ? () => onSelect({ kind: 'block', id: block.id }) : undefined}
                    openLabel={`Открыть: ${title}`}
                    muted={quiet}
                  />
                </div>
              )
            })}
          </SlideGrid>
          {blocks.length > VISIBLE_BLOCKS && (
            <button type="button" className={styles.link} onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Свернуть' : `Показать все ${blocks.length}`}
            </button>
          )}
        </section>
      )}

      {insights.length === 0 && blocks.length === 0 && <p className={styles.emptyTable}>Материала пока мало. На следующем шаге решим, чем дополнить.</p>}
    </div>
  )
}
