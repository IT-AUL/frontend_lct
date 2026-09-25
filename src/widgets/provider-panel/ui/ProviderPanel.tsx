import { Drawer } from '@/shared/ui'

interface ProviderPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProviderPanel({ open, onOpenChange }: ProviderPanelProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Провайдер моделей">
      <div />
    </Drawer>
  )
}
