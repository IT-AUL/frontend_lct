import { useState, type ReactNode } from 'react'
import { AboutPanel } from '@/widgets/about-panel'
import { AppHeader, type RunStatus } from '@/widgets/app-header'
import { ProviderPanel } from '@/widgets/provider-panel'
import styles from './AppFrame.module.css'

type Panel = 'provider' | 'about' | null

interface AppFrameProps {
  projectName?: ReactNode
  status?: RunStatus
  rail?: ReactNode
  children: ReactNode
}

export function AppFrame({ projectName, status, rail, children }: AppFrameProps) {
  const [panel, setPanel] = useState<Panel>(null)
  const closeWhen = (open: boolean) => {
    if (!open) setPanel(null)
  }

  return (
    <div className={styles.frame}>
      <AppHeader
        projectName={projectName}
        status={status}
        providerConnected={false}
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
