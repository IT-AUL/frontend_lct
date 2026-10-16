import { useEffect, useId, useRef } from 'react'
import { TextArea } from '@/shared/ui'
import { TOPIC_MAX_LENGTH } from '../lib/brief'
import styles from './BriefForm.module.css'

interface TopicSectionProps {
  value: string
  error?: string
  focusSignal?: number
  onChange: (value: string) => void
}

export function TopicSection({ value, error, focusSignal = 0, onChange }: TopicSectionProps) {
  const titleId = useId()
  const hintId = useId()
  const errorId = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  const hasError = Boolean(error)

  useEffect(() => {
    if (focusSignal > 0 && hasError) input.current?.focus()
  }, [focusSignal, hasError])

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <div className={styles.sectionHead}>
        <h2 id={titleId} className={styles.sectionTitle}>
          О чём презентация
        </h2>
      </div>
      <TextArea
        ref={input}
        aria-labelledby={titleId}
        aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ')}
        aria-invalid={hasError || undefined}
        rows={2}
        maxLength={TOPIC_MAX_LENGTH}
        className={styles.topic}
        value={value}
        placeholder="Например: запуск корпоративного мессенджера для банков в 2027 году"
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={hintId} className={styles.fieldHint}>
        Можно одной фразой — недостающее найдём и предложим в плане.
      </span>
      {error && (
        <div id={errorId} className={styles.error} role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
