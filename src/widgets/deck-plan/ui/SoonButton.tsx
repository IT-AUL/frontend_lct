import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'
import styles from './SoonButton.module.css'

export const PLAN_EDIT_SOON = 'Скоро: правка плана до вёрстки'

interface SoonButtonProps {
  label: string
  className?: string
  block?: boolean
  children: ReactNode
}

export function SoonButton({ label, className, block, children }: SoonButtonProps) {
  const tipId = useId()
  return (
    <span className={clsx(styles.wrap, block && styles.block)}>
      <button type="button" aria-disabled="true" aria-label={label} aria-describedby={tipId} className={clsx(styles.button, className)}>
        {children}
      </button>
      <span role="tooltip" id={tipId} className={styles.tip}>
        {PLAN_EDIT_SOON}
      </span>
    </span>
  )
}
