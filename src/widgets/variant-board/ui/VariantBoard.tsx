import type { VariantSummary } from '@/entities/variant'
import { Skeleton } from '@/shared/ui'
import styles from './VariantBoard.module.css'
import { VariantCard } from './VariantCard'

interface VariantBoardProps {
  variants: readonly VariantSummary[]
  showThumbnails: boolean
  auditHref: (variantId: string, slideNumber?: number) => string
}

export function VariantBoard({ variants, showThumbnails, auditHref }: VariantBoardProps) {
  return (
    <div className={styles.board}>
      {variants.map((variant) => (
        <VariantCard key={variant.id} variant={variant} showThumbnails={showThumbnails} auditHref={auditHref} />
      ))}
    </div>
  )
}

export function VariantBoardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={styles.board} aria-busy="true" aria-label="Загружаем варианты">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={styles.skeleton} delay={index * 0.12} />
      ))}
    </div>
  )
}
