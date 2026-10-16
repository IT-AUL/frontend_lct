import { useCallback, useState } from 'react'
import type { DeckPlan } from '@/entities/generation'
import { readJson, removeKey, writeJson } from '@/shared/lib/storage'
import { addSlide, addUnit, isPlanEdited, moveSlide, moveUnit, removeSlide, removeUnit, updateSlide, updateUnit, type SlidePatch } from '../lib/editPlan'

const STORAGE_PREFIX = 'deckdna.plan-draft.v1:'

interface StoredDraft {
  baseId: string
  plan: DeckPlan
}

export interface PlanDraft {
  plan: DeckPlan
  edited: boolean
  move: (slideId: string, delta: -1 | 1) => void
  remove: (slideId: string) => void
  update: (slideId: string, patch: SlidePatch) => void
  add: () => void
  updateUnit: (slideId: string, position: number, text: string) => void
  addUnit: (slideId: string) => void
  removeUnit: (slideId: string, position: number) => void
  moveUnit: (slideId: string, position: number, delta: -1 | 1) => void
  reset: () => void
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

function readDraft(key: string, base: DeckPlan): DeckPlan | null {
  const stored = readJson<StoredDraft | null>(storageKey(key), null)
  return stored && stored.baseId === base.id && Array.isArray(stored.plan?.slides) ? stored.plan : null
}

export function clearPlanDraft(key: string): void {
  removeKey(storageKey(key))
}

export function usePlanDraft(key: string, base: DeckPlan): PlanDraft {
  const [state, setState] = useState(() => ({ key, baseId: base.id, plan: readDraft(key, base) }))
  const current = state.key === key && state.baseId === base.id ? state : { key, baseId: base.id, plan: readDraft(key, base) }
  if (current !== state) setState(current)
  const plan = current.plan ?? base

  const commit = useCallback(
    (edit: (plan: DeckPlan) => DeckPlan) => {
      setState((previous) => {
        const source = previous.key === key && previous.baseId === base.id ? (previous.plan ?? base) : base
        const next = edit(source)
        if (next === source) return previous
        if (isPlanEdited(base, next)) writeJson(storageKey(key), { baseId: base.id, plan: next } satisfies StoredDraft)
        else clearPlanDraft(key)
        return { key, baseId: base.id, plan: next }
      })
    },
    [key, base],
  )

  return {
    plan,
    edited: isPlanEdited(base, plan),
    move: (slideId, delta) => commit((draft) => moveSlide(draft, slideId, delta)),
    remove: (slideId) => commit((draft) => removeSlide(draft, slideId)),
    update: (slideId, patch) => commit((draft) => updateSlide(draft, slideId, patch)),
    add: () => commit((draft) => addSlide(draft)),
    updateUnit: (slideId, position, text) => commit((draft) => updateUnit(draft, slideId, position, text)),
    addUnit: (slideId) => commit((draft) => addUnit(draft, slideId)),
    removeUnit: (slideId, position) => commit((draft) => removeUnit(draft, slideId, position)),
    moveUnit: (slideId, position, delta) => commit((draft) => moveUnit(draft, slideId, position, delta)),
    reset: () => {
      clearPlanDraft(key)
      setState({ key, baseId: base.id, plan: null })
    },
  }
}
