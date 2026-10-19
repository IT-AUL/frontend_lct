import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, X } from '@/shared/ui'
import styles from './StepShell.module.css'

interface StepShellProps {
  title: string
  note?: ReactNode
  children?: ReactNode
  command?: ReactNode
  actions?: ReactNode
  canvas: ReactNode
  canvasLabel: string
  inspector?: { title: string; content: ReactNode; onClose: () => void; wide?: boolean } | null
  footnote?: ReactNode
}

export function StepShell({ title, note, children, command, actions, canvas, canvasLabel, inspector, footnote }: StepShellProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef<(() => void) | null>(null)
  const inspectorKey = inspector ? inspector.title : null

  useEffect(() => {
    onCloseRef.current = inspector?.onClose ?? null
  })

  useEffect(() => {
    if (inspectorKey === null) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectorKey])

  return (
    <div className={styles.shell}>
      <section className={styles.decision} aria-labelledby="step-title">
        <div className={styles.decisionBody}>
          <h1 id="step-title" className={styles.title}>
            {title}
          </h1>
          {note && (
            <p className={styles.note} aria-live="polite">
              {note}
            </p>
          )}
          {children && <div className={styles.controls}>{children}</div>}
        </div>
        {command && <div className={styles.command}>{command}</div>}
        {actions && (
          <div className={styles.actions}>
            <div className={styles.actionRow}>{actions}</div>
            {footnote && <p className={styles.footnote}>{footnote}</p>}
          </div>
        )}
      </section>
      <section
        className={styles.table}
        data-inspector={inspector ? (inspector.wide ? 'wide' : 'side') : undefined}
        aria-label={canvasLabel}
      >
        <div className={styles.tableScroll}>{canvas}</div>
        {inspector && (
          <>
            <div className={styles.inspectorBackdrop} aria-hidden="true" onClick={inspector.onClose} />
            <aside className={styles.inspector} data-wide={inspector.wide || undefined} aria-label={inspector.title}>
              <header className={styles.inspectorHeader}>
                <h2 className={styles.inspectorTitle}>{inspector.title}</h2>
                <button ref={closeRef} type="button" className={styles.close} onClick={inspector.onClose} aria-label="Закрыть">
                  <Icon as={X} size={16} />
                </button>
              </header>
              <div className={styles.inspectorBody}>{inspector.content}</div>
            </aside>
          </>
        )}
      </section>
    </div>
  )
}
