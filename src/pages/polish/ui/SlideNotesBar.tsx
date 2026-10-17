import { useState } from 'react'
import { Badge, Button, Check, Copy, CornerDownRight, Icon, Lock, useToast, type Tone } from '@/shared/ui'
import type { SlideNotesView, SlideOriginKind } from '../model/polishModel'
import styles from './PolishPage.module.css'

interface SlideNotesBarProps {
  slideNumber: number
  view: SlideNotesView
  sourceNote?: string | null
}

const ORIGIN_TONE: Record<SlideOriginKind, Tone> = {
  data: 'ok',
  user: 'neutral',
  web: 'info',
  general: 'warn',
  locked: 'ink',
}

const pad = (value: number) => String(value).padStart(2, '0')

export function SlideNotesBar({ slideNumber, view, sourceNote }: SlideNotesBarProps) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copyableText = view.speakerNote ?? view.keyMessage ?? (view.bullets.length > 0 ? view.bullets.join('\n') : null)

  const handleCopy = async () => {
    if (!copyableText) return
    try {
      await navigator.clipboard?.writeText(copyableText)
      setCopied(true)
      toast.show(`Заметки слайда ${pad(slideNumber)} скопированы`)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.show('Не удалось скопировать текст в буфер обмена')
    }
  }

  return (
    <section aria-label="Заметки докладчика и источники" className={styles.notesBar}>
      <div className={styles.notesHead}>
        <div className={styles.notesTitleRow}>
          <h2 className={styles.notesTitle}>Заметки докладчика и источники</h2>
          {view.origins.map((origin) =>
            origin.href ? (
              <a
                key={origin.key}
                href={origin.href}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.originLink}
                title={origin.title}
              >
                {origin.label}
              </a>
            ) : (
              <Badge key={origin.key} tone={ORIGIN_TONE[origin.kind]} title={origin.title}>
                {origin.kind === 'locked' && <Icon as={Lock} size={10} />}
                <span>{origin.label}</span>
              </Badge>
            ),
          )}
        </div>
        {copyableText && (
          <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
            <Icon as={copied ? Check : Copy} size={13} />
            <span>{copied ? 'Скопировано' : 'Скопировать заметки'}</span>
          </Button>
        )}
      </div>

      {view.speakerNote ? (
        <p className={styles.notesText}>{view.speakerNote}</p>
      ) : view.keyMessage || view.bullets.length > 0 ? (
        <>
          {view.keyMessage && <p className={styles.notesText}>{view.keyMessage}</p>}
          {view.bullets.length > 0 && (
            <ul className={styles.notesBullets}>
              {view.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className={styles.notesEmpty}>Отдельных заметок докладчика для слайда №{pad(slideNumber)} нет.</p>
      )}

      {(view.sources.length > 0 || sourceNote) && (
        <div className={styles.sourceList} aria-label="Источники слайда">
          {sourceNote && (
            <span className={styles.sourceChip}>
              <Icon as={CornerDownRight} size={11} />
              <span>{sourceNote}</span>
            </span>
          )}
          {view.sources.map((source) => (
            <span key={source.key} className={styles.sourceChip} title={`${source.label}\n${source.refs.join('\n')}`}>
              <Icon as={CornerDownRight} size={11} />
              <span>{source.label}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
