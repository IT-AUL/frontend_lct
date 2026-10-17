export { DraftDeck } from './ui/DraftDeck'
export type { Selection } from './ui/DraftDeck'
export { MiniChart } from './ui/MiniChart'
export { blockTitle, insightEntries, insightTitle, keyFigure, needsDecision, stepNote, textBlocks } from './lib/table'
export {
  applyOptimisticBlockOps,
  applyOptimisticInsightPatch,
  applyOptimisticNotes,
  CHART_TYPE_LABEL,
  fallbackUnderstandingFromContentPack,
} from './lib/understanding'
