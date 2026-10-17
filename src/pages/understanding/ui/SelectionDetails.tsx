import { useState } from 'react'
import type { InsightPatch, Understanding } from '@/entities/assistant'
import { Button } from '@/shared/ui'
import { blockTitle, insightEntries, insightTitle, needsDecision } from '../lib/table'
import { CHART_TYPE_LABEL } from '../lib/understanding'
import type { Selection } from './UnderstandingTable'
import { MiniChart } from './MiniChart'
import styles from './UnderstandingPage.module.css'

interface SelectionDetailsProps {
  understanding: Understanding
  selection: Selection
  onPatchInsight: (id: string, patch: InsightPatch) => void
  onEditBlock: (id: string, patch: { title?: string; text?: string }) => void
  onRemoveBlock: (id: string) => void
}

function profileSentence(profile: string | null): string | null {
  if (!profile) return null
  const parts = profile.split(';').map((part) => part.trim()).filter(Boolean)
  const size = parts.filter((part) => /строк|колон/.test(part)).join(', ')
  const gaps = parts.some((part) => part.startsWith('есть пропуски')) ? ' Есть пропуски — учту их на графике.' : ''
  return size ? `${size.charAt(0).toUpperCase()}${size.slice(1)}.${gaps}` : null
}

function chartName(type: string | null | undefined): string {
  return type ? (CHART_TYPE_LABEL[type] ?? type).toLowerCase() : ''
}

export function SelectionDetails({ understanding, selection, onPatchInsight, onEditBlock, onRemoveBlock }: SelectionDetailsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (selection.kind === 'block') {
    const block = understanding.blocks.find((item) => item.id === selection.id)
    if (!block) return null
    const title = blockTitle(block)
    return (
      <div className={styles.details}>
        {editing ? (
          <>
            <textarea className={styles.noteInput} rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Текст блока" />
            <div className={styles.noteActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  onEditBlock(block.id, { text: draft })
                  setEditing(false)
                }}
              >
                Сохранить
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.detailLead}>{title}</p>
            {block.text && block.text.trim() !== title && <p className={styles.detailText}>{block.text}</p>}
            <div className={styles.noteActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(block.text ?? '')
                  setEditing(true)
                }}
              >
                Изменить
              </Button>
              <Button variant="ghost" onClick={() => onRemoveBlock(block.id)}>
                Не включать в презентацию
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  const entry = insightEntries(understanding).find((item) => item.insight.id === selection.id)
  if (!entry) return null
  const { insight, dataset, preview } = entry
  const title = insightTitle(insight)
  const chosen = dataset.recommendations[0]?.chart_type
  const alternatives = dataset.recommendations.slice(1, 3).map((item) => chartName(item.chart_type)).filter(Boolean)
  const profile = profileSentence(dataset.profile_summary)
  const decide = needsDecision(insight)

  return (
    <div className={styles.details}>
      {editing ? (
        <>
          <textarea className={styles.noteInput} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Формулировка вывода" />
          <div className={styles.noteActions}>
            <Button
              variant="secondary"
              onClick={() => {
                onPatchInsight(insight.id, { text: draft })
                setEditing(false)
              }}
            >
              Сохранить
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.detailLead}>{title}</p>
      )}

      {insight.meaning && (
        <div className={styles.detailBlock}>
          <h3 className={styles.detailHeading}>Что это значит</h3>
          <p className={styles.detailText}>{insight.meaning}</p>
        </div>
      )}

      {insight.implication && (
        <div className={styles.detailBlock}>
          <h3 className={styles.detailHeading}>Что из этого следует</h3>
          <p className={styles.detailText}>{insight.implication}</p>
          {decide && <p className={styles.detailMuted}>Это моё предложение. Оставлю его в презентации, только если вы согласны.</p>}
        </div>
      )}

      {!editing && (
        <div className={styles.noteActions}>
          {decide ? (
            <Button variant="primary" onClick={() => onPatchInsight(insight.id, { confirmed: true })}>
              Согласен
            </Button>
          ) : insight.confirmed ? (
            <Button variant="ghost" onClick={() => onPatchInsight(insight.id, { confirmed: false })}>
              Отменить согласие
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(title)
              setEditing(true)
            }}
          >
            Изменить формулировку
          </Button>
        </div>
      )}

      <div className={styles.detailBlock}>
        <h3 className={styles.detailHeading}>Данные и график</h3>
        {preview && (
          <div className={styles.detailChart}>
            <MiniChart preview={preview} chartType={chosen} label={`График: ${dataset.title ?? ''}`} />
          </div>
        )}
        <p className={styles.detailText}>
          {dataset.file ?? dataset.title}
          {profile ? `. ${profile}` : ''}
        </p>
        {dataset.why && <p className={styles.detailText}>{dataset.why}</p>}
        {alternatives.length > 0 && <p className={styles.detailMuted}>Подойдёт и так: {alternatives.join(', ')}. Сменить график можно на шаге «План».</p>}
      </div>
    </div>
  )
}
