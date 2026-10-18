export { DraftDeck } from './ui/DraftDeck'
export type { Selection } from './ui/DraftDeck'
export { MiniChart } from './ui/MiniChart'
export { SparkChart } from './ui/SparkChart'
export { blockTitle, datasetGroups, insightEntries, insightSource, insightTitle, keyFigure, needsDecision, profileFacts, stepNote, textBlocks } from './lib/table'
export {
  applyOptimisticBlockOps,
  applyOptimisticInsightPatch,
  applyOptimisticNotes,
  CHART_TYPE_LABEL,
  deduplicateTextBlocks,
  extractFigure,
  fallbackUnderstandingFromContentPack,
} from './lib/understanding'
