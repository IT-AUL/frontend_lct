import { useState } from 'react'
import type { GenerationTracker } from '@/entities/generation'
import { autoSelectedKey } from '../lib/scene'
import { variantCards, type VariantCard } from '../lib/variants'

export function useBuildCards(tracker: GenerationTracker, requestedStrategies?: readonly string[]): VariantCard[] {
  return variantCards(tracker.phase, tracker.generation?.variants, requestedStrategies)
}

export function useSelectedBuildKey(cards: readonly VariantCard[]): [string | null, (key: string) => void] {
  const [picked, setPicked] = useState<string | null>(null)
  const key = cards.some((card) => card.key === picked) ? picked : autoSelectedKey(cards)
  return [key, setPicked]
}
