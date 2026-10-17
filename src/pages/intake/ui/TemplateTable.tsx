import type { ReactNode } from 'react'
import type { BrandbookSummary, BrandPriority, TemplateSummary } from '@/entities/assistant'
import { pluralize } from '@/shared/lib/format'
import { SlideTile } from '@/shared/ui'
import styles from './IntakePage.module.css'

interface TemplateTableProps {
  summary: TemplateSummary | null
  analyzing: boolean
  brandbook: BrandbookSummary | null
  priority: BrandPriority
  priorityControl: ReactNode
  onOpenDetails?: () => void
}

function fontStack(font: string | null): string {
  return font ? `"${font}", var(--font-sans)` : 'var(--font-sans)'
}

export function TemplateTable({ summary, analyzing, brandbook, priority, priorityControl, onOpenDetails }: TemplateTableProps) {
  if (!summary) {
    return (
      <div className={styles.tableEmpty}>
        <SlideTile pending={analyzing} fill>
          <span className={styles.ghost}>{analyzing ? 'Читаю шаблон' : 'Здесь появится ваша презентация'}</span>
        </SlideTile>
      </div>
    )
  }

  const brandWins = brandbook && priority === 'brandbook'
  const palette = brandWins ? brandbook.palette.map((color) => color.hex).filter((hex): hex is string => Boolean(hex)) : summary.palette
  const heading = (brandWins ? brandbook.fonts.find((font) => font.role === 'heading')?.family : null) ?? summary.heading_font
  const body = (brandWins ? brandbook.fonts.find((font) => font.role === 'body')?.family : null) ?? summary.body_font
  const slides = summary.slides ?? 0
  const accent = palette[0] ?? 'var(--ink)'

  return (
    <div className={styles.tableContent}>
      <div className={styles.specimen}>
        <SlideTile fill>
          <span className={styles.specimenSlide}>
            <span className={styles.specimenBar} style={{ background: accent }} />
            <span className={styles.specimenTitle} style={{ fontFamily: fontStack(heading) }}>
              Так будут выглядеть ваши слайды
            </span>
            <span className={styles.specimenBody} style={{ fontFamily: fontStack(body) }}>
              Цвета, шрифты и раскладки беру из шаблона{brandWins ? ', а где они расходятся с брендбуком — из брендбука' : ''}.
            </span>
            <span className={styles.specimenPalette}>
              {palette.slice(0, 6).map((hex) => (
                <span key={hex} className={styles.swatch} style={{ background: hex }} title={hex} />
              ))}
            </span>
          </span>
        </SlideTile>
      </div>

      <p className={styles.templateFacts}>
        {summary.filename ?? 'Шаблон'}
        {slides > 0 && `, ${slides} ${pluralize(slides, ['слайд', 'слайда', 'слайдов'])}`}
        {heading && `. Заголовки — ${heading}${body && body !== heading ? `, текст — ${body}` : ''}`}.
      </p>
      {onOpenDetails && (
        <button type="button" className={styles.linkButton} onClick={onOpenDetails}>
          Все правила шаблона
        </button>
      )}

      {brandbook && (
        <div className={styles.brand}>
          <p className={styles.brandText}>
            Брендбук {brandbook.name ? `«${brandbook.name}»` : ''}
            {brandbook.conflicts.length > 0
              ? ` расходится с шаблоном в ${brandbook.conflicts.length} ${pluralize(brandbook.conflicts.length, ['месте', 'местах', 'местах'])}. Что важнее?`
              : ' совпадает с шаблоном.'}
          </p>
          {brandbook.conflicts.length > 0 && priorityControl}
        </div>
      )}
    </div>
  )
}
