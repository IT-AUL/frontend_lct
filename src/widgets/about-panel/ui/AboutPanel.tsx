import { Drawer } from '@/shared/ui'

interface AboutPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutPanel({ open, onOpenChange }: AboutPanelProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="О системе">
      <div />
    </Drawer>
  )
}
