import { clsx } from 'clsx'
import { boxStyle, checkKind, clampBox, ruleMeta, type AuditIssue, type DisplayStatus } from '@/entities/audit'
import styles from './IssueOverlay.module.css'

export interface OverlayItem {
  key: string
  issue: AuditIssue
  status: DisplayStatus
}

interface IssueOverlayProps {
  items: readonly OverlayItem[]
  activeKey?: string | null
  hoverKey?: string | null
  onPick?: (key: string) => void
  onHover?: (key: string | null) => void
}

const TAG_EDGE = 0.08

function tagPlacement(y: number, h: number): 'above' | 'below' | 'inside' {
  if (y > TAG_EDGE) return 'above'
  if (y + h < 1 - TAG_EDGE) return 'below'
  return 'inside'
}

export function IssueOverlay({ items, activeKey, hoverKey, onPick, onHover }: IssueOverlayProps) {
  const placed = items
    .map((item) => ({ ...item, box: clampBox(item.issue.clipped_bbox ?? item.issue.bbox) }))
    .filter((item) => item.box !== null)
    .sort((a, b) => Number(a.key === activeKey) - Number(b.key === activeKey))

  return (
    <div className={styles.layer}>
      {placed.map(({ key, issue, status, box }) => {
        if (!box) return null
        const active = key === activeKey
        const highlighted = active || key === hoverKey
        const name = ruleMeta(issue.rule_code).name
        const label = `${checkKind(issue)} · ${name}${box.clipped ? ' · за краем слайда' : ''}`
        const className = clsx(styles.box, highlighted && styles.highlighted, active && styles.active)
        const common = {
          className,
          style: boxStyle(box),
          'data-severity': issue.severity,
          'data-status': status,
        }
        const tag = highlighted && (
          <span className={styles.tag} data-placement={tagPlacement(box.y, box.h)}>
            {label}
          </span>
        )
        if (!onPick) {
          return (
            <span key={key} {...common} aria-hidden>
              {tag}
            </span>
          )
        }
        return (
          <button
            key={key}
            type="button"
            {...common}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onPick(key)}
            onMouseEnter={() => onHover?.(key)}
            onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(key)}
            onBlur={() => onHover?.(null)}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
