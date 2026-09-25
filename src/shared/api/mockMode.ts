export interface SeededRun {
  projectId: string
  runId: string
}

export async function startMockWorker(): Promise<SeededRun[]> {
  const [{ startMockWorker: start }, { generationFixture }] = await Promise.all([import('./mocks/browser'), import('./mocks/fixtures')])
  await start()
  return [{ projectId: generationFixture.project_id, runId: generationFixture.id }]
}
