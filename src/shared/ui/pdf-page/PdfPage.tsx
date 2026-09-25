import { clsx } from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePdfDocument } from '@/shared/lib/pdf'
import styles from './PdfPage.module.css'

interface PdfPageProps {
  url: string | null | undefined
  pageNumber: number
  aspectRatio?: number
  lazy?: boolean
  className?: string
  label?: string
  children?: ReactNode
}

type RenderState = 'idle' | 'ready' | 'error'

export function PdfPage({ url, pageNumber, aspectRatio = 16 / 9, lazy = true, className, label, children }: PdfPageProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(!lazy)
  const [width, setWidth] = useState(0)
  const [ratio, setRatio] = useState(aspectRatio)
  const [state, setState] = useState<RenderState>('idle')
  const { data: pdf, isError } = usePdfDocument(visible ? url : null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const resize = new ResizeObserver((entries) => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)))
    resize.observe(frame)
    if (visible) return () => resize.disconnect()
    const intersect = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin: '200px' },
    )
    intersect.observe(frame)
    return () => {
      resize.disconnect()
      intersect.disconnect()
    }
  }, [visible])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!pdf || !canvas || width === 0 || pageNumber < 1 || pageNumber > pdf.numPages) return
    let cancelled = false
    let cancelRender: (() => void) | undefined
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const base = page.getViewport({ scale: 1 })
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: (width / base.width) * pixelRatio })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const task = page.render({ canvas, viewport })
        cancelRender = () => task.cancel()
        setRatio(base.width / base.height)
        return task.promise.then(() => {
          if (!cancelled) setState('ready')
        })
      })
      .catch((error: unknown) => {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) setState('error')
      })
    return () => {
      cancelled = true
      cancelRender?.()
    }
  }, [pdf, pageNumber, width])

  const outOfRange = Boolean(pdf) && (pageNumber < 1 || pageNumber > (pdf?.numPages ?? 0))
  const failed = isError || outOfRange || state === 'error'

  return (
    <div
      ref={frameRef}
      className={clsx(styles.frame, className)}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={label ?? `Слайд ${pageNumber}`}
      data-state={failed ? 'error' : state}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {failed && <span className={styles.fallback}>Нет превью</span>}
      {children && <div className={styles.overlay}>{children}</div>}
    </div>
  )
}
