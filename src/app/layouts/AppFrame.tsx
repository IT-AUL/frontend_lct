import { useState, type ReactNode } from 'react'
import { useActiveProviderSession } from '@/entities/provider-session'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { AboutPanel } from '@/widgets/about-panel'
import { AppHeader, type RunStatus } from '@/widgets/app-header'
import { ProviderPanel } from '@/widgets/provider-panel'
import { API_MODE } from '@/shared/config'
import { readJson, writeJson } from '@/shared/lib/storage'
import { Icon, X } from '@/shared/ui'
import styles from './AppFrame.module.css'

type Panel = 'provider' | 'about' | null

const DEMO_NOTICE_KEY = 'deckdna.demo-notice.dismissed.v1'

function DemoNotice() {
  const [dismissed, setDismissed] = useState(() => readJson(DEMO_NOTICE_KEY, false, 'session'))
  if (dismissed) return null

  const dismiss = () => {
    writeJson(DEMO_NOTICE_KEY, true, 'session')
    setDismissed(true)
  }

  return (
    <div className={styles.demoNotice} role="note">
      <span className={styles.demoText}>
        <b>Демо-режим:</b> ответы сервиса записаны заранее и не зависят от ваших данных
      </span>
      <button type="button" className={styles.demoClose} aria-label="Скрыть уведомление о демо-режиме" onClick={dismiss}>
        <Icon as={X} size={14} />
      </button>
    </div>
  )
}

interface AppFrameProps {
  projectName?: ReactNode
  status?: RunStatus
  rail?: ReactNode
  children: ReactNode
}

export function AppFrame({ projectName, status, rail, children }: AppFrameProps) {
  const [panel, setPanel] = useState<Panel>(null)
  const providerSession = useActiveProviderSession()
  const modelAuto = useCapabilityFlag(FEATURE_PATHS.modelAuto)
  const closeWhen = (open: boolean) => {
    if (!open) setPanel(null)
  }

  return (
    <div className={styles.frame}>
      {API_MODE === 'mock' && <DemoNotice />}
      <AppHeader
        projectName={projectName}
        status={status}
        providerConnected={Boolean(providerSession) || modelAuto}
        onOpenProvider={() => setPanel('provider')}
        onOpenAbout={() => setPanel('about')}
      />
      <div className={styles.body}>
        {rail}
        <main className={styles.main}>{children}</main>
      </div>
      <ProviderPanel open={panel === 'provider'} onOpenChange={closeWhen} />
      <AboutPanel open={panel === 'about'} onOpenChange={closeWhen} />
    </div>
  )
}
