import { useRef } from 'react'
import type { Question } from '@/entities/assistant'
import { Badge, Button, Check, Icon } from '@/shared/ui'
import {
  CONTENT_SHORT_META,
  defaultOptionValue,
  isContentShortQuestion,
  questionTitle,
  type ContentShortOptionMeta,
  type QuestionSelection,
} from '../lib/questions'
import styles from './QuestionsPage.module.css'

export interface QuestionCardProps {
  question: Question
  index: number
  total: number
  selection: QuestionSelection
  skipped: boolean
  thesisNotes: readonly [string, string, string]
  disabled?: boolean
  onSelectOption: (questionId: string, value: string) => void
  onSelectCustom: (questionId: string) => void
  onCustomTextChange: (questionId: string, text: string) => void
  onToggleSkip: (questionId: string) => void
  onThesisNoteChange: (slotIndex: 0 | 1 | 2, text: string) => void
}

export function QuestionCard({
  question,
  index,
  total,
  selection,
  skipped,
  thesisNotes,
  disabled = false,
  onSelectOption,
  onSelectCustom,
  onCustomTextChange,
  onToggleSkip,
  onThesisNoteChange,
}: QuestionCardProps) {
  const customInputRef = useRef<HTMLInputElement>(null)
  const title = questionTitle(question)
  const isShort = isContentShortQuestion(question)

  const handleActivateCustom = () => {
    onSelectCustom(question.id)
    setTimeout(() => customInputRef.current?.focus(), 0)
  }

  return (
    <section
      className={styles.questionCard}
      data-skipped={skipped || undefined}
      data-kind={question.kind ?? question.id}
      aria-label={title}
    >
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardEyebrowRow}>
            <span className={styles.cardEyebrow}>
              {isShort ? 'Как поступим?' : `Вопрос ${index + 1} из ${total}`}
            </span>
            {skipped && <Badge tone="muted">Пропущен — возьму нейтральный вариант</Badge>}
          </div>
          <h2 className={styles.cardTitle}>{title}</h2>
          {question.reason && (
            <p className={styles.cardReason}>
              <span className={styles.reasonPrefix}>Почему спрашиваю:</span> {question.reason}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-pressed={skipped}
          onClick={() => onToggleSkip(question.id)}
        >
          {skipped ? 'Вернуть вопрос' : 'Пропустить вопрос'}
        </Button>
      </header>

      {!skipped && (
        <div className={styles.cardBody}>
          {isShort ? (
            <>
              <div className={styles.shortGrid} role="radiogroup" aria-label="Как поступим?">
                {question.options.map((option) => {
                  const isSelected = selection.mode === 'option' && selection.value === option.value
                  const meta = CONTENT_SHORT_META[option.value as ContentShortOptionMeta['value']]
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={disabled}
                      className={styles.shortOptionCard}
                      data-selected={isSelected || undefined}
                      onClick={() => onSelectOption(question.id, option.value)}
                    >
                      <div className={styles.shortOptionTop}>
                        <span className={styles.radioDot} data-checked={isSelected || undefined}>
                          {isSelected && <Icon as={Check} size={11} />}
                        </span>
                        <span className={styles.shortOptionLabel}>{option.label}</span>
                        {option.recommended && (
                          <Badge tone={isSelected ? 'ok' : 'ink'} shape="tag">
                            советую
                          </Badge>
                        )}
                        {!option.recommended && meta?.badge && (
                          <Badge tone="warn" shape="tag">
                            {meta.badge}
                          </Badge>
                        )}
                      </div>
                      {(option.note || meta?.description) && (
                        <span className={styles.shortOptionDesc}>{option.note ?? meta?.description}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {selection.mode === 'option' && selection.value === 'notes' && (
                <div className={styles.notesBox} role="region" aria-label="Ваши тезисы">
                  <div className={styles.notesHeader}>
                    <span className={styles.notesTitle}>Добавьте 1–3 коротких тезиса своими словами</span>
                    <span className={styles.notesHint}>Они попадут в контент-пак и станут основой ключевых слайдов</span>
                  </div>
                  <div className={styles.notesFields}>
                    {([0, 1, 2] as const).map((slotIndex) => (
                      <label key={slotIndex} className={styles.noteFieldRow}>
                        <span className={styles.noteSlotLabel}>Тезис {slotIndex + 1}</span>
                        <input
                          type="text"
                          className={styles.noteSlotInput}
                          value={thesisNotes[slotIndex]}
                          disabled={disabled}
                          aria-label={`Тезис ${slotIndex + 1}`}
                          placeholder={
                            slotIndex === 0
                              ? 'Например: Выручка выросла вдвое за счёт корпоративного сегмента'
                              : slotIndex === 1
                                ? 'Например: Снижение оттока клиентов с 8% до 3,2%'
                                : 'Например: План масштабирования на 2027 год'
                          }
                          onChange={(event) => onThesisNoteChange(slotIndex, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.chipsArea}>
              <div className={styles.chipsRow} role="radiogroup" aria-label={title}>
                {question.options.map((option) => {
                  const isSelected = selection.mode === 'option' && selection.value === option.value
                  return (
                    <button
                      key={option.value || '__empty__'}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={disabled}
                      className={styles.optionChip}
                      data-selected={isSelected || undefined}
                      data-recommended={option.recommended || undefined}
                      onClick={() => onSelectOption(question.id, option.value)}
                    >
                      {option.recommended && <span className={styles.starMark}>★</span>}
                      <span>{option.label}</span>
                      {option.recommended && <span className={styles.recSuffix}>· советую</span>}
                    </button>
                  )
                })}

                {question.allow_custom && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selection.mode === 'custom'}
                    disabled={disabled}
                    className={styles.optionChip}
                    data-selected={selection.mode === 'custom' || undefined}
                    onClick={handleActivateCustom}
                  >
                    <span>✎ Своё</span>
                  </button>
                )}
              </div>

              {selection.mode === 'custom' && question.allow_custom && (
                <div className={styles.customRow}>
                  <input
                    ref={customInputRef}
                    type="text"
                    className={styles.customInput}
                    value={selection.customText}
                    disabled={disabled}
                    aria-label={`Свой вариант: ${title}`}
                    placeholder="Напишите свой вариант ответа…"
                    onChange={(event) => onCustomTextChange(question.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        onSelectOption(question.id, defaultOptionValue(question))
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
