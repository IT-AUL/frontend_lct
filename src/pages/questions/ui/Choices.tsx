import { useId } from 'react'
import type { Question } from '@/entities/assistant'
import { CONTENT_SHORT_META, isContentShortQuestion, type QuestionSelection } from '../lib/questions'
import styles from './QuestionsPage.module.css'

interface ChoicesProps {
  question: Question
  heading: string | null
  reason: string | null
  selection: QuestionSelection | undefined
  skipped: boolean
  notes: readonly [string, string, string]
  onOption: (value: string) => void
  onCustom: () => void
  onCustomText: (text: string) => void
  onNote: (slot: 0 | 1 | 2, text: string) => void
}

export function Choices({ question, heading, reason, selection, skipped, notes, onOption, onCustom, onCustomText, onNote }: ChoicesProps) {
  const name = useId()
  const short = isContentShortQuestion(question)
  const custom = selection?.mode === 'custom'
  return (
    <fieldset className={styles.question} disabled={skipped}>
      {heading && <legend className={styles.legend}>{heading}</legend>}
      {reason && <p className={styles.reason}>{reason}</p>}
      <div className={styles.options}>
        {question.options.map((option) => {
          const meta = short ? CONTENT_SHORT_META[option.value as keyof typeof CONTENT_SHORT_META] : undefined
          const checked = !custom && selection?.value === option.value
          return (
            <label key={option.value} className={styles.option} data-checked={checked || undefined}>
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onOption(option.value)} />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>
                  {meta?.title ?? option.label}
                  {option.recommended && <span className={styles.recommended}>советую</span>}
                </span>
                {(meta?.description ?? option.note) && <span className={styles.optionNote}>{meta?.description ?? option.note}</span>}
              </span>
            </label>
          )
        })}
        {question.allow_custom && (
          <label className={styles.option} data-checked={custom || undefined}>
            <input type="radio" name={name} checked={custom} onChange={onCustom} />
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>Свой вариант</span>
              {custom && (
                <input
                  className={styles.customInput}
                  value={selection?.customText ?? ''}
                  autoFocus
                  aria-label="Свой вариант"
                  onChange={(event) => onCustomText(event.target.value)}
                />
              )}
            </span>
          </label>
        )}
      </div>
      {short && selection?.value === 'notes' && (
        <div className={styles.notes}>
          {([0, 1, 2] as const).map((slot) => (
            <input
              key={slot}
              className={styles.customInput}
              value={notes[slot]}
              placeholder={`Тезис ${slot + 1}`}
              aria-label={`Тезис ${slot + 1}`}
              onChange={(event) => onNote(slot, event.target.value)}
            />
          ))}
        </div>
      )}
    </fieldset>
  )
}
