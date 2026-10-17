import { useState } from 'react'
import type { DataPreview, Insight, InsightPatch } from '@/entities/assistant'
import { AlertTriangle, Badge, Button, Check, Icon, Mono, Skeleton } from '@/shared/ui'
import { isInsightDefaultIncluded, isInsightRecommendation, sanitizeAssistantCopy } from '../lib/understanding'
import { SparkChart } from './SparkChart'
import styles from './UnderstandingPage.module.css'

export interface InsightCardProps {
  insight: Insight
  preview?: DataPreview | null
  interpretationPending?: boolean
  disabled?: boolean
  onPatch: (insightId: string, patch: InsightPatch) => void
}

export function InsightCard({ insight, preview, interpretationPending = false, disabled = false, onPatch }: InsightCardProps) {
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(insight.headline || insight.fact)
  const [draftMeaning, setDraftMeaning] = useState(insight.meaning ?? '')
  const [draftImplication, setDraftImplication] = useState(insight.implication ?? '')

  const isRecommendation = isInsightRecommendation(insight)
  const defaultIncluded = isInsightDefaultIncluded(insight)
  const headline = sanitizeAssistantCopy(insight.headline || insight.fact)
  const factText = sanitizeAssistantCopy(insight.fact)
  const showDistinctFact = Boolean(insight.headline && insight.fact && insight.headline.trim() !== insight.fact.trim())
  const meaningText = insight.meaning ? sanitizeAssistantCopy(insight.meaning) : null
  const implicationText = insight.implication ? sanitizeAssistantCopy(insight.implication) : null

  const openEditor = () => {
    setDraftText(insight.headline || insight.fact)
    setDraftMeaning(insight.meaning ?? '')
    setDraftImplication(insight.implication ?? '')
    setEditing(true)
  }

  const saveEdit = () => {
    const cleanText = draftText.trim()
    if (!cleanText) return
    const patch: InsightPatch = {
      text: cleanText,
      confirmed: true,
      ...(draftMeaning.trim() !== (insight.meaning ?? '') ? { meaning: draftMeaning.trim() || null } : {}),
      ...(draftImplication.trim() !== (insight.implication ?? '') ? { implication: draftImplication.trim() || null } : {}),
    }
    onPatch(insight.id, patch)
    setEditing(false)
  }

  const toggleConfirmed = () => {
    onPatch(insight.id, { confirmed: !insight.confirmed })
  }

  return (
    <article
      className={styles.insightCard}
      data-confirmed={insight.confirmed || undefined}
      data-needs-confirmation={(isRecommendation && !insight.confirmed) || undefined}
      aria-label={`Вывод: ${headline}`}
    >
      <header className={styles.insightHeader}>
        <div className={styles.insightBadges}>
          {isRecommendation ? (
            <Badge tone={insight.confirmed ? 'ok' : 'warn'} dot>
              {insight.confirmed ? 'Предложение подтверждено' : 'Предложение, подтвердите'}
            </Badge>
          ) : (
            <Badge tone={insight.confirmed || defaultIncluded ? 'ok' : 'neutral'} dot={Boolean(insight.confirmed || defaultIncluded)}>
              Факт из данных
            </Badge>
          )}
          <Badge tone="ok" shape="tag" title={insight.evidence?.join(' · ') || 'Посчитано по таблице'}>
            ваши данные
          </Badge>
        </div>

        <div className={styles.insightActions}>
          <Button
            variant={insight.confirmed ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={Boolean(insight.confirmed)}
            disabled={disabled}
            onClick={toggleConfirmed}
          >
            {insight.confirmed && <Icon as={Check} size={12} />}
            {insight.confirmed ? 'Оставлено' : 'Оставить'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => (editing ? setEditing(false) : openEditor())}
          >
            Изменить
          </Button>
        </div>
      </header>

      {editing ? (
        <div className={styles.editBox}>
          <label className={styles.editField}>
            <span className={styles.editLabel}>Формулировка вывода (факт)</span>
            <input
              type="text"
              className={styles.editInput}
              value={draftText}
              aria-label="Формулировка вывода"
              onChange={(event) => setDraftText(event.target.value)}
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
          <label className={styles.editField}>
            <span className={styles.editLabel}>Что это значит (интерпретация)</span>
            <input
              type="text"
              className={styles.editInput}
              value={draftMeaning}
              placeholder="Например: рост ускорился во втором полугодии"
              aria-label="Что это значит"
              onChange={(event) => setDraftMeaning(event.target.value)}
            />
          </label>
          <label className={styles.editField}>
            <span className={styles.editLabel}>Что из этого следует (предложение)</span>
            <input
              type="text"
              className={styles.editInput}
              value={draftImplication}
              placeholder="Например: закрепить фокус на ключевом канале"
              aria-label="Что из этого следует"
              onChange={(event) => setDraftImplication(event.target.value)}
            />
          </label>
          <div className={styles.editActions}>
            <Button variant="primary" size="sm" disabled={!draftText.trim()} onClick={saveEdit}>
              Сохранить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.insightBody}>
          <div className={styles.insightStep}>
            <span className={styles.stepTag}>Факт</span>
            <div className={styles.stepContent}>
              <h3 className={styles.insightHeadline}>{headline}</h3>
              {showDistinctFact && <p className={styles.insightFact}>{factText}</p>}
            </div>
          </div>

          {(meaningText || interpretationPending) && (
            <div className={styles.insightStep}>
              <span className={styles.stepTag}>Значит</span>
              <div className={styles.stepContent}>
                {meaningText ? (
                  <p className={styles.insightMeaning}>{meaningText}</p>
                ) : (
                  <div className={styles.pendingMeaning}>
                    <Skeleton className={styles.skeletonLine} />
                    <span className={styles.pendingHint}>Дописываю пояснение к цифрам…</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(implicationText || isRecommendation) && (
            <div
              className={styles.implicationBox}
              data-confirmed={insight.confirmed || undefined}
            >
              <div className={styles.implicationTop}>
                <span className={styles.implicationBadge}>
                  <Icon as={insight.confirmed ? Check : AlertTriangle} size={12} />
                  {insight.confirmed ? 'Следует · подтверждено для слайда выводов' : 'Следует · предложение, подтвердите'}
                </span>
                {!insight.confirmed && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onPatch(insight.id, { confirmed: true })}
                  >
                    <Icon as={Check} size={12} />
                    Подтвердить
                  </Button>
                )}
              </div>
              <p className={styles.implicationText}>{implicationText ?? factText}</p>
            </div>
          )}

          {preview && (
            <SparkChart preview={preview} title={headline} className={styles.insightSpark} />
          )}

          {insight.evidence && insight.evidence.length > 0 && (
            <footer className={styles.insightFooter}>
              <Mono className={styles.evidenceText}>{insight.evidence.join(' · ')}</Mono>
              {!insight.confirmed && defaultIncluded && (
                <span className={styles.includedHint}>✓ Включено в план по умолчанию</span>
              )}
            </footer>
          )}
        </div>
      )}
    </article>
  )
}
