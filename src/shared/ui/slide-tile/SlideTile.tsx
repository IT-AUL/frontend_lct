import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import styles from './SlideTile.module.css'

interface SlideTileProps {
  title?: ReactNode
  children?: ReactNode
  image?: string | null
  caption?: ReactNode
  selected?: boolean
  muted?: boolean
  pending?: boolean
  onOpen?: () => void
  openLabel?: string
  corner?: ReactNode
  fill?: boolean
}

export function SlideTile({ title, children, image, caption, selected, muted, pending, onOpen, openLabel, corner, fill }: SlideTileProps) {
  const face = fill ? (
    <span className={styles.fill}>{children}</span>
  ) : image ? (
    <img className={styles.image} src={image} alt="" loading="lazy" />
  ) : (
    <span className={styles.draft}>
      {title && <span className={styles.title}>{title}</span>}
      {children && <span className={styles.visual}>{children}</span>}
    </span>
  )
  return (
    <figure className={clsx(styles.tile, muted && styles.muted)} data-selected={selected || undefined}>
      <div className={styles.frameWrap}>
        {onOpen ? (
          <button type="button" className={styles.frame} onClick={onOpen} aria-label={openLabel} aria-busy={pending || undefined}>
            {face}
          </button>
        ) : (
          <div className={styles.frame} aria-busy={pending || undefined}>
            {face}
          </div>
        )}
        {corner && <div className={styles.corner}>{corner}</div>}
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  )
}

export function SlideGrid({ children, columns = 3, label }: { children: ReactNode; columns?: 2 | 3 | 4; label?: string }) {
  return (
    <div className={styles.grid} data-columns={columns} role={label ? 'list' : undefined} aria-label={label}>
      {children}
    </div>
  )
}
