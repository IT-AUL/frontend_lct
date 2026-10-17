import { Link } from 'react-router'
import type { AuditIssue, JournalEntry, RepairBatch } from '@/entities/audit'
import { IssueList, JournalList, type ClusteredGroup } from '@/widgets/audit-workspace'
import { pluralize } from '@/shared/lib/format'
import { Badge, Button, CircleCheck, Icon, Skeleton } from '@/shared/ui'
import styles from './PolishPage.module.css'

export type AuditScope = 'slide' | 'deck' | 'journal'

interface SlideAuditSectionProps {
  slideNumber: number
  scope: AuditScope
  onScopeChange: (scope: AuditScope) => void
  slideOpenCount: number
  totalOpenCount: number
  journalCount: number
  groups: readonly ClusteredGroup[]
  expanded: ReadonlySet<string>
  onToggleGroup: (groupKey: string) => void
  selectedIds: ReadonlySet<string>
  activeKey: string | null
  hoverKey: string | null
  auditId: string | undefined
  auditPending: boolean
  auditUnavailable: boolean
  repairPending: boolean
  fixableIssues: readonly AuditIssue[]
  selectedIssues: readonly AuditIssue[]
  journal: readonly JournalEntry[]
  batches: readonly RepairBatch[]
  auditHref: string
  onActivate: (key: string) => void
  onHover: (key: string | null) => void
  onSelect: (issueIds: readonly string[], selected: boolean) => void
  onRepair: (issues: readonly AuditIssue[]) => void
  onDismissed: (issues: readonly AuditIssue[], reason: string) => void
}

const pad = (value: number) => String(value).padStart(2, '0')

export function SlideAuditSection(props: SlideAuditSectionProps) {
  const {
    slideNumber,
    scope,
    onScopeChange,
    slideOpenCount,
    totalOpenCount,
    journalCount,
    groups,
    expanded,
    onToggleGroup,
    selectedIds,
    activeKey,
    hoverKey,
    auditId,
    auditPending,
    auditUnavailable,
    repairPending,
    fixableIssues,
    selectedIssues,
    journal,
    batches,
    auditHref,
    onActivate,
    onHover,
    onSelect,
    onRepair,
    onDismissed,
  } = props

  const primaryTargets = selectedIssues.length > 0 ? selectedIssues : fixableIssues
  const primaryLabel =
    selectedIssues.length > 0
      ? `Исправить выбранное (${selectedIssues.length})`
      : scope === 'slide'
        ? `Исправить на слайде (${fixableIssues.length})`
        : `Исправить все (${fixableIssues.length})`

  return (
    <section aria-label="Что можно улучшить" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Что можно улучшить</h2>
        <Badge tone={slideOpenCount === 0 ? 'ok' : 'warn'} mono>
          {slideOpenCount === 0 ? 'Чисто' : `${slideOpenCount} на сл. ${pad(slideNumber)}`}
        </Badge>
      </div>

      <div className={styles.auditTabs} role="group" aria-label="Область замечаний аудита">
        <button type="button" className={styles.auditTab} aria-pressed={scope === 'slide'} onClick={() => onScopeChange('slide')}>
          Слайд {pad(slideNumber)} · {slideOpenCount}
        </button>
        <button type="button" className={styles.auditTab} aria-pressed={scope === 'deck'} onClick={() => onScopeChange('deck')}>
          Вся колода · {totalOpenCount}
        </button>
        <button type="button" className={styles.auditTab} aria-pressed={scope === 'journal'} onClick={() => onScopeChange('journal')}>
          Журнал · {journalCount}
        </button>
      </div>

      {auditPending ? (
        <div aria-busy="true" aria-label="Загружаю замечания аудита">
          <Skeleton style={{ height: 48, marginBottom: 6 }} />
          <Skeleton style={{ height: 48 }} delay={0.08} />
        </div>
      ) : auditUnavailable ? (
        <div className={styles.cleanBox}>
          <div className={styles.cleanRow}>
            <Icon as={CircleCheck} size={16} />
            <span>Критичных замечаний по этому слайду не обнаружено.</span>
          </div>
        </div>
      ) : scope === 'journal' ? (
        <div className={styles.auditListWrap}>
          <JournalList entries={journal} batches={batches} />
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.cleanBox}>
          <div className={styles.cleanRow}>
            <Icon as={CircleCheck} size={16} />
            <span>
              {scope === 'slide'
                ? 'На этом слайде всё чисто: поля, шрифты и контраст в норме шаблона.'
                : 'В колоде нет открытых замечаний аудита.'}
            </span>
          </div>
          {scope === 'slide' && totalOpenCount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onScopeChange('deck')}>
              Показать замечания на других слайдах ({totalOpenCount} {pluralize(totalOpenCount, ['находка', 'находки', 'находок'])})
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.auditListWrap}>
            <IssueList
              groups={groups}
              grouping="rule"
              expanded={expanded}
              onToggleGroup={onToggleGroup}
              selectedIds={selectedIds}
              activeKey={activeKey}
              hoverKey={hoverKey}
              auditId={auditId}
              repairPending={repairPending}
              onActivate={onActivate}
              onHover={onHover}
              onSelect={onSelect}
              onRepair={onRepair}
              onDismissed={onDismissed}
            />
          </div>
          <div className={styles.auditFooter}>
            {primaryTargets.length > 0 ? (
              <Button
                size="sm"
                variant="primary"
                disabled={repairPending}
                aria-busy={repairPending || undefined}
                onClick={() => onRepair(primaryTargets)}
              >
                {repairPending ? 'Исправляю…' : primaryLabel}
              </Button>
            ) : (
              <span className={styles.cardSub}>Автоматических правок для этих замечаний нет</span>
            )}
            <Link to={auditHref} className={styles.auditLink}>
              Все фильтры аудита
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
