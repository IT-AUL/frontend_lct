export async function startMockWorker(): Promise<void> {
  const { startMockWorker: start } = await import('./mocks/browser')
  await start()
}
