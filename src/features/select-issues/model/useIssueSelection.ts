import { useState } from 'react'
import { pruneSelection, toggleSelection } from '@/entities/audit'

export interface IssueSelection {
  selectedIds: ReadonlySet<string>
  count: number
  isSelected: (issueId: string) => boolean
  toggle: (issueId: string) => void
  selectAll: () => void
  clear: () => void
}

const EMPTY: ReadonlySet<string> = new Set()

export function useIssueSelection(selectable: readonly string[]): IssueSelection {
  const [raw, setRaw] = useState<ReadonlySet<string>>(EMPTY)
  const selectedIds = pruneSelection(raw, selectable)

  return {
    selectedIds,
    count: selectedIds.size,
    isSelected: (issueId) => selectedIds.has(issueId),
    toggle: (issueId) => {
      if (selectable.includes(issueId)) setRaw(toggleSelection(selectedIds, issueId))
    },
    selectAll: () => setRaw(new Set(selectable)),
    clear: () => setRaw(EMPTY),
  }
}
