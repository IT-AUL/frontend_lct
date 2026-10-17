import { useState } from 'react'
import type { UnderstandingBlock, UnderstandingDataset } from '@/entities/assistant'
import { ArrowDown, ArrowRightLeft, ArrowUp, Badge, Button, ExternalLink, FileText, Icon, Mono, X } from '@/shared/ui'
import {
  BLOCK_KIND_LABEL,
  BLOCK_KIND_TONE,
  blockOrigin,
  formatSourceDetails,
  normalizeBlockKind,
  sanitizeAssistantCopy,
} from '../lib/understanding'
import { SparkChart } from './SparkChart'
import styles from './UnderstandingPage.module.css'

export interface BlockCardProps {
  block: UnderstandingBlock
  index: number
  total: number
  datasets: readonly UnderstandingDataset[]
  mergeTargetId: string | null
  mergeTargetTitle: string | null
  disabled?: boolean
  onRemove: (blockId: string) => void
  onMove: (blockId: string, targetIndex: number) => void
  onMerge: (blockId: string, intoId: string) => void
  onEdit: (blockId: string, patch: { title?: string; text?: string }) => void
}

export function BlockCard({
  block,
  index,
  total,
  datasets,
  mergeTargetId,
  mergeTargetTitle,
  disabled = false,
  onRemove,
  onMove,
  onMerge,
  onEdit,
}: BlockCardProps) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(block.title ?? '')
  const [draftText, setDraftText] = useState(block.text ?? '')
  const [dragOver, setDragOver] = useState(false)

  const kindKey = normalizeBlockKind(block.kind)
  const kindLabel = BLOCK_KIND_LABEL[kindKey]
  const kindTone = BLOCK_KIND_TONE[kindKey]
  const origin = blockOrigin(block, datasets)
  const sourceLines = formatSourceDetails(block, datasets)
  const canEdit = block.id.startsWith('s:') || block.id.startsWith('b:')
  const titleText = block.title ? sanitizeAssistantCopy(block.title) : kindLabel
  const bodyText = block.text ? sanitizeAssistantCopy(block.text) : null

  const startEdit = () => {
    setDraftTitle(block.title ?? '')
    setDraftText(block.text ?? '')
    setEditing(true)
  }

  const saveEdit = () => {
    if (block.id.startsWith('s:')) {
      if (!draftTitle.trim()) return
      onEdit(block.id, { title: draftTitle.trim() })
    } else {
      if (!draftText.trim()) return
      onEdit(block.id, { text: draftText.trim() })
    }
    setEditing(false)
  }

  return (
    <article
      className={styles.blockCard}
      data-kind={kindKey}
      data-drag-over={dragOver || undefined}
      aria-label={`Блок: ${titleText}`}
      draggable={!editing && !disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', block.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const sourceId = event.dataTransfer.getData('text/plain')
        if (sourceId && sourceId !== block.id) {
          onMerge(sourceId, block.id)
        }
      }}
    >
      <header className={styles.blockHeader}>
        <div className={styles.blockBadges}>
          <Badge tone={kindTone}>{kindLabel}</Badge>
          {origin.url ? (
            <a
              className={styles.originLink}
              href={origin.url}
              target="_blank"
              rel="noreferrer noopener"
              title={origin.detail ?? origin.url}
            >
              <Badge tone={origin.tone} shape="tag">
                {origin.label}
                <Icon as={ExternalLink} size={10} />
              </Badge>
            </a>
          ) : (
            <Badge tone={origin.tone} shape="tag" title={origin.detail ?? undefined}>
              {origin.label}
            </Badge>
          )}
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          aria-label={`Убрать блок ${titleText}`}
          title="Убрать блок"
          disabled={disabled}
          onClick={() => onRemove(block.id)}
        >
          <Icon as={X} size={14} />
        </button>
      </header>

      {editing ? (
        <div className={styles.editBox}>
          {block.id.startsWith('s:') ? (
            <label className={styles.editField}>
              <span className={styles.editLabel}>Заголовок блока</span>
              <input
                type="text"
                className={styles.editInput}
                value={draftTitle}
                aria-label="Заголовок блока"
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    saveEdit()
                  } else if (event.key === 'Escape') {
                    setEditing(false)
                  }
                }}
              />
            </label>
          ) : (
            <label className={styles.editField}>
              <span className={styles.editLabel}>Текст блока</span>
              <textarea
                rows={3}
                className={styles.editTextarea}
                value={draftText}
                aria-label="Текст блока"
                onChange={(event) => setDraftText(event.target.value)}
              />
            </label>
          )}
          <div className={styles.editActions}>
            <Button variant="primary" size="sm" onClick={saveEdit}>
              Сохранить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.blockBody}>
          {block.title && <h3 className={styles.blockTitle}>{titleText}</h3>}
          {bodyText && (!block.title || bodyText !== titleText) && (
            <p className={styles.blockText}>{bodyText}</p>
          )}
          {block.preview && (
            <SparkChart preview={block.preview} title={titleText} className={styles.blockSpark} />
          )}
        </div>
      )}

      {sourceOpen && (
        <div className={styles.sourceDrawer} role="region" aria-label={`Исходник блока ${titleText}`}>
          <div className={styles.sourceTitle}>Исходник материала</div>
          <ul className={styles.sourceList}>
            {sourceLines.map((line, idx) => (
              <li key={idx}>
                <Mono className={styles.sourceLine}>{line}</Mono>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className={styles.blockFooter}>
        <div className={styles.blockOrderActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Поднять блок ${titleText}`}
            title="Переместить выше"
            disabled={disabled || index === 0}
            onClick={() => onMove(block.id, index - 1)}
          >
            <Icon as={ArrowUp} size={13} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Опустить блок ${titleText}`}
            title="Переместить ниже"
            disabled={disabled || index >= total - 1}
            onClick={() => onMove(block.id, index + 1)}
          >
            <Icon as={ArrowDown} size={13} />
          </button>
          {mergeTargetId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Объединить блок ${titleText}`}
              title={mergeTargetTitle ? `Объединить с блоком «${mergeTargetTitle}»` : 'Объединить с соседним блоком'}
              onClick={() => onMerge(block.id, mergeTargetId)}
            >
              <Icon as={ArrowRightLeft} size={12} />
              Объединить
            </Button>
          )}
          {canEdit && !editing && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={startEdit}>
              Изменить
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-expanded={sourceOpen}
          aria-label={`Исходник блока ${titleText}`}
          onClick={() => setSourceOpen((prev) => !prev)}
        >
          <Icon as={FileText} size={12} />
          {sourceOpen ? 'Скрыть исходник' : 'Исходник'}
        </Button>
      </footer>
    </article>
  )
}
