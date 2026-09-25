import { clsx } from 'clsx'
import { useState } from 'react'
import {
  CATEGORY_LABEL,
  CheckKindBadge,
  checkKind,
  describeMeasurement,
  isPendingStatus,
  plannedFix,
  ruleMeta,
  SeverityBadge,
  slideNumber,
  type AuditIssue,
  type DisplayStatus,
  type IssueView,
} from '@/entities/audit'
import { DismissIssueForm } from '@/features/dismiss-issue'
import { Badge, Checkbox, CircleCheck, Icon, Mono, type Tone } from '@/shared/ui'
import { STATUS_LABEL } from '../model/labels'
import styles from './IssueCard.module.css'

const STATUS_TONE: Record<DisplayStatus, Tone> = {
  open: 'neutral',
  selected: 'ink',
  fixed: 'ok',
  unresolved: 'error',
  dismissed: 'muted',
}

export interface IssueCardProps {
  view: IssueView
  active: boolean
  hovered: boolean
  auditId: string | undefined
  repairPending: boolean
  onActivate: (key: string) => void
  onHover: (key: string | null) => void
  onToggleSelect: (issueId: string) => void
  onRepairOne: (issue: AuditIssue) => void
  onDismissed: (issue: AuditIssue, reason: string) => void
}

function fixGuidance(view: IssueView): { title: string; text: string; note: string | null } {
  const { issue, selectable } = view
  const planned = plannedFix(issue)
  if (selectable && planned) return { title: 'Что будет сделано', text: planned, note: null }
  if (!issue.deterministic) {
    return {
      title: 'Как исправить',
      text: planned ? `Модель предлагает: ${planned.charAt(0).toLowerCase()}${planned.slice(1)}.` : 'Поправьте в PowerPoint или отклоните с причиной.',
      note: null,
    }
  }
  return {
    title: 'Как исправить',
    text: 'Поправьте в PowerPoint или отклоните с причиной.',
    note: null,
  }
}

export function IssueCard({ view, active, hovered, auditId, repairPending, onActivate, onHover, onToggleSelect, onRepairOne, onDismissed }: IssueCardProps) {
  const [dismissing, setDismissing] = useState(false)
  const { issue, status, note, selectable } = view
  const meta = ruleMeta(issue.rule_code)
  const measurement = describeMeasurement(issue)
  const number = slideNumber(issue)
  const pending = isPendingStatus(status)
  const guidance = fixGuidance(view)
  const hasMeasurement = measurement.hasValue || measurement.threshold !== '—'
  const provenance = issue.deterministic
    ? issue.provenance?.rule_version
    : [issue.provenance?.model_id, issue.provenance?.prompt_version].filter(Boolean).join(' · ')
  const earlierDismissal = pending && note?.outcome === 'dismissed' ? note : null

  return (
    <article
      className={clsx(styles.card, active && styles.active, hovered && styles.hovered)}
      data-issue-key={view.key}
      onMouseEnter={() => onHover(view.key)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={styles.head}>
        {selectable && (
          <span className={styles.check}>
            <Checkbox checked={status === 'selected'} onChange={() => onToggleSelect(issue.id)} label={`Выбрать для исправления: ${meta.name}`} />
          </span>
        )}
        <button type="button" className={styles.toggle} aria-expanded={active} onClick={() => onActivate(view.key)}>
          <span className={styles.titleRow}>
            <SeverityBadge severity={issue.severity} short />
            <CheckKindBadge kind={checkKind(issue)} />
            <span className={styles.name}>{meta.name}</span>
            <Mono className={styles.slide}>{number ? `сл. ${String(number).padStart(2, '0')}` : 'колода'}</Mono>
          </span>
          {!active && (
            <span className={styles.summary}>
              {hasMeasurement ? (
                <>
                  <Mono>{measurement.measured}</Mono>
                  <span className={styles.muted}>при норме {measurement.threshold}</span>
                </>
              ) : (
                <span className={styles.message}>{issue.message}</span>
              )}
              <span className={styles.spacer} />
              <Badge tone={STATUS_TONE[status]} shape="tag" className={styles.status}>
                {STATUS_LABEL[status]}
              </Badge>
            </span>
          )}
        </button>
      </div>

      {active && (
        <div className={styles.details}>
          <p className={styles.text}>{issue.message}</p>
          {hasMeasurement && (
            <dl className={styles.measure}>
              <div className={styles.cell}>
                <dt>Измерено</dt>
                <dd className={styles.measured} data-severity={issue.severity}>
                  {measurement.measured}
                </dd>
              </div>
              <div className={styles.cell}>
                <dt>Порог</dt>
                <dd>{measurement.threshold}</dd>
              </div>
            </dl>
          )}
          <div className={styles.meta}>
            <Mono>{issue.rule_code}</Mono>
            <span>{CATEGORY_LABEL[meta.category]}</span>
            <span>{issue.deterministic ? 'D · правило в коде' : 'N · проверяет модель'}</span>
            {provenance && <Mono>{provenance}</Mono>}
          </div>
          {issue.evidence && issue.evidence.length > 0 && (
            <ul className={styles.evidence} aria-label="Доказательства">
              {issue.evidence.slice(0, 3).map((item, index) => (
                <li key={`${item.kind}-${index}`}>
                  {item.kind && <Mono>{item.kind}</Mono>} {item.detail ?? item.ref}
                </li>
              ))}
            </ul>
          )}
          {!issue.deterministic && typeof issue.confidence === 'number' && (
            <div className={styles.confidence}>
              <span className={styles.confidenceLabel}>Уверенность модели</span>
              <span className={styles.track}>
                <span className={styles.fill} style={{ width: `${Math.round(issue.confidence * 100)}%` }} />
              </span>
              <Mono>{issue.confidence.toFixed(2)}</Mono>
            </div>
          )}
          <div className={styles.plan}>
            <div className={styles.planTitle}>{guidance.title}</div>
            <div>{guidance.text}</div>
            {guidance.note && <div className={styles.planNote}>{guidance.note}</div>}
          </div>

          {status === 'unresolved' && (
            <div className={styles.failed}>
              <b>Не удалось исправить.</b>{' '}
              {note ? `Не исправилось в ревизии r${note.revision}.` : 'Правка не применилась.'} Поправьте вручную или отклоните.
            </div>
          )}
          {status === 'dismissed' && <div className={styles.dismissed}>Отклонено: {note?.reason ?? 'причина сохранена'}</div>}
          {status === 'fixed' && <div className={styles.fixed}>
              <Icon as={CircleCheck} size={14} /> Исправлено{note ? ` в ревизии r${note.revision}` : ''}
            </div>}
          {earlierDismissal && (
            <div className={styles.dismissed}>
              Ранее отклонено в r{earlierDismissal.revision}: {earlierDismissal.reason}. После новой ревизии сервис снова нашёл проблему.
            </div>
          )}

          {pending && auditId && !dismissing && (
            <div className={styles.actions}>
              {selectable && (
                <button type="button" className={styles.primary} disabled={repairPending} onClick={() => onRepairOne(issue)}>
                  Исправить
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={() => setDismissing(true)}>
                Отклонить…
              </button>
            </div>
          )}
          {pending && auditId && dismissing && (
            <DismissIssueForm
              issue={issue}
              auditId={auditId}
              initialReason={earlierDismissal?.reason ?? ''}
              onCancel={() => setDismissing(false)}
              onDismissed={(updated, reason) => {
                setDismissing(false)
                onDismissed(updated, reason)
              }}
            />
          )}
        </div>
      )}
    </article>
  )
}
