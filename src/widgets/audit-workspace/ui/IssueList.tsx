import { useEffect, useRef } from 'react'
import type { IssueViewGroup } from '@/entities/audit'
import { IssueCard, type IssueCardProps } from './IssueCard'
import styles from './IssuePanel.module.css'

type CardHandlers = Omit<IssueCardProps, 'view' | 'active' | 'hovered'>

export interface IssueListProps extends CardHandlers {
  groups: readonly IssueViewGroup[]
  activeKey: string | null
  hoverKey: string | null
}

export function IssueList({ groups, activeKey, hoverKey, ...handlers }: IssueListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeKey) return
    const card = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-issue-key]') ?? [])].find(
      (element) => element.dataset.issueKey === activeKey,
    )
    card?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey])

  return (
    <div ref={listRef} className={styles.list}>
      {groups.length === 0 && <div className={styles.empty}>По этим фильтрам проблем нет.</div>}
      {groups.map((group) => (
        <section key={group.key} className={styles.group} aria-label={group.label}>
          <h3 className={styles.groupTitle}>
            {group.label} <span className={styles.groupCount}>· {group.views.length}</span>
          </h3>
          {group.views.map((view) => (
            <IssueCard key={view.key} view={view} active={view.key === activeKey} hovered={view.key === hoverKey} {...handlers} />
          ))}
        </section>
      ))}
    </div>
  )
}
