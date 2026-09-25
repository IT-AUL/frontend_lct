import { readJson, writeJson } from '@/shared/lib/storage'

const STORAGE_KEY = 'deckdna.runs.v1'

type RunHistory = Record<string, string[]>

export function readRunIds(projectId: string): string[] {
  return readJson<RunHistory>(STORAGE_KEY, {})[projectId] ?? []
}

export function latestRunId(projectId: string): string | undefined {
  return readRunIds(projectId).at(-1)
}

export function rememberRun(projectId: string, runId: string): void {
  const history = readJson<RunHistory>(STORAGE_KEY, {})
  const runs = (history[projectId] ?? []).filter((id) => id !== runId)
  writeJson(STORAGE_KEY, { ...history, [projectId]: [...runs, runId] })
}
