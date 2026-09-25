import { Button } from '@/shared/ui'
import styles from './RepairBar.module.css'

interface RepairBarProps {
  selectedCount: number
  fixableCount: number
  pending: boolean
  onSelectAll: () => void
  onClear: () => void
  onRepair: () => void
}

export function RepairBar({ selectedCount, fixableCount, pending, onSelectAll, onClear, onRepair }: RepairBarProps) {
  const hasSelection = selectedCount > 0
  return (
    <div className={styles.bar}>
      {hasSelection ? (
        <Button size="lg" className={styles.side} onClick={onClear} disabled={pending}>
          Снять
        </Button>
      ) : (
        <Button size="lg" className={styles.side} onClick={onSelectAll} disabled={pending || fixableCount === 0}>
          Выбрать исправимые ({fixableCount})
        </Button>
      )}
      <Button variant="primary" size="lg" className={styles.main} onClick={onRepair} disabled={!hasSelection || pending} aria-busy={pending}>
        {pending ? 'Применяю правки…' : `Исправить выбранное (${selectedCount})`}
      </Button>
    </div>
  )
}
