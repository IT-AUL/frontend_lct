import { clsx } from 'clsx'
import { useId, useState, type FormEvent } from 'react'
import { useDismissIssue, type AuditIssue } from '@/entities/audit'
import { DISMISS_REASONS } from '../model/reasons'
import styles from './DismissIssueForm.module.css'

interface DismissIssueFormProps {
  issue: AuditIssue
  auditId: string
  initialReason?: string
  onDismissed: (issue: AuditIssue, reason: string) => void
  onCancel: () => void
}

export function DismissIssueForm({ issue, auditId, initialReason = '', onDismissed, onCancel }: DismissIssueFormProps) {
  const [reason, setReason] = useState(initialReason)
  const dismiss = useDismissIssue(auditId)
  const titleId = useId()
  const trimmed = reason.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!trimmed || dismiss.isPending) return
    dismiss.mutate({ issueId: issue.id, reason: trimmed }, { onSuccess: (updated) => onDismissed(updated, trimmed) })
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={titleId}>
      <div id={titleId} className={styles.title}>
        Причина отклонения — обязательно
      </div>
      <div className={styles.chips} role="group" aria-label="Готовые причины">
        {DISMISS_REASONS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={reason === preset}
            className={clsx(styles.chip, reason === preset && styles.chipActive)}
            onClick={() => setReason(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <input
        className={styles.input}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="или своими словами"
        aria-label="Причина отклонения"
        required
      />
      {dismiss.isError && (
        <div role="alert" className={styles.error}>
          Не удалось отклонить: {dismiss.error.message}
        </div>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.confirm} disabled={!trimmed || dismiss.isPending}>
          {dismiss.isPending ? 'Отклоняю…' : 'Отклонить'}
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}
