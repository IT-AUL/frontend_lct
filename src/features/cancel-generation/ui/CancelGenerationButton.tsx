import { useCancelGeneration } from '@/entities/generation'
import { Button, useToast } from '@/shared/ui'

interface CancelGenerationButtonProps {
  generationId: string
  onCanceled?: () => void
}

export function CancelGenerationButton({ generationId, onCanceled }: CancelGenerationButtonProps) {
  const cancel = useCancelGeneration()
  const toast = useToast()

  const handleClick = () => {
    cancel.mutate(generationId, {
      onSuccess: () => {
        toast.show('Генерация отменена. Бриф сохранён.')
        onCanceled?.()
      },
      onError: (error) => toast.show(error.message),
    })
  }

  return (
    <Button size="lg" onClick={handleClick} disabled={cancel.isPending}>
      {cancel.isPending ? 'Отменяем…' : 'Отменить'}
    </Button>
  )
}
