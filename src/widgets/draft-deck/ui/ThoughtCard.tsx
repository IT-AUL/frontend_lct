import type { UnderstandingBlock, UnderstandingDataset } from '@/entities/assistant'
import { Badge, Button } from '@/shared/ui'
import { blockTitle } from '../lib/table'
import { BLOCK_KIND_LABEL, BLOCK_KIND_TONE, blockOrigin, normalizeBlockKind, sanitizeAssistantCopy } from '../lib/understanding'
import styles from './DraftDeck.module.css'

export interface ThoughtCardProps {
  block: UnderstandingBlock
  datasets: readonly UnderstandingDataset[]
  selected?: boolean
  onOpen?: () => void
  onEdit?: () => void
  onRemove?: (blockId: string) => void
}

export function ThoughtCard({ block, datasets, selected, onOpen, onEdit, onRemove }: ThoughtCardProps) {
  const kindKey = normalizeBlockKind(block.kind)
  const kindLabel = BLOCK_KIND_LABEL[kindKey]
  const origin = blockOrigin(block, datasets)
  const title = block.title ? sanitizeAssistantCopy(block.title) : kindLabel
  const bodyText = block.text ? sanitizeAssistantCopy(block.text) : null
  const cardTitle = blockTitle(block)

  return (
    <article className={styles.thought} role="listitem" data-selected={selected || undefined} aria-label={`Блок: ${cardTitle}`}>
      <header className={styles.thoughtMeta}>
        <Badge tone={BLOCK_KIND_TONE[kindKey]}>{kindLabel}</Badge>
        <span className={styles.thoughtOrigin}>{origin.label}</span>
      </header>
      <h3 className={styles.thoughtTitle}>
        {onOpen ? (
          <button type="button" className={styles.insightOpen} onClick={onOpen} aria-label={`Открыть: ${cardTitle}`}>
            {title}
          </button>
        ) : (
          title
        )}
      </h3>
      {bodyText && bodyText !== title && <p className={styles.thoughtText}>{bodyText}</p>}
      {(onEdit || onRemove) && (
        <footer className={styles.thoughtActions}>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Изменить
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(block.id)}>
              Не включать
            </Button>
          )}
        </footer>
      )}
    </article>
  )
}
