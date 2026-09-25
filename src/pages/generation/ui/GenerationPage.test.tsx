import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { useGenerationTracker, useRetryGeneration, type GenerationTracker } from '@/entities/generation'
import { latestRunId, markEvidence, rememberRun } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { generationFixture } from '@/shared/api/mocks'
import { routes } from '@/shared/config'
import { ToastProvider } from '@/shared/ui'
import { GenerationPage } from './GenerationPage'
import type * as GenerationModule from '@/entities/generation'
import type * as ProjectModule from '@/entities/project'

vi.mock('@/entities/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof GenerationModule>()),
  useGenerationTracker: vi.fn(),
  useRetryGeneration: vi.fn(),
}))

vi.mock('@/entities/project', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectModule>()),
  latestRunId: vi.fn(),
  markEvidence: vi.fn(),
  rememberRun: vi.fn(),
}))

vi.mock('@/features/variant-files', () => ({
  useVariantFiles: () => ({ variant: undefined, files: null, pdfUrl: null, pptxUrl: null, passportArtifactId: null, isPending: false, error: null }),
}))

const PROJECT = 'prj_1'
const RUN = generationFixture.id
const TRACKING = 'local-abc-1'
const retryMutate = vi.fn()

function makeTracker(overrides: Partial<GenerationTracker>): GenerationTracker {
  return {
    trackingId: null,
    generationId: null,
    jobId: null,
    variantIds: [],
    phase: 'running',
    startedAt: Date.now() - 5_000,
    finishedAt: null,
    generation: undefined,
    job: undefined,
    error: null,
    jobError: null,
    canCancel: false,
    ...overrides,
  }
}

function useTracker(tracker: GenerationTracker) {
  vi.mocked(useGenerationTracker).mockReturnValue(tracker)
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderPage(runId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[routes.run(PROJECT, runId)]}>
          <Routes>
            <Route path="/projects/:projectId/runs/:runId" element={<GenerationPage />} />
            <Route path="*" element={<div>other screen</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const completed = { ...generationFixture, state: 'completed' as const }
const running = {
  ...generationFixture,
  state: 'running' as const,
  finished_at: null,
  variants: generationFixture.variants.map((variant, index) => ({
    ...variant,
    status: (['completed', 'running', 'queued'] as const)[index] ?? 'queued',
  })),
}

describe('GenerationPage', () => {
  beforeEach(() => {
    retryMutate.mockReset()
    vi.mocked(useRetryGeneration).mockReturnValue({ mutate: retryMutate, isPending: false } as unknown as ReturnType<typeof useRetryGeneration>)
    vi.mocked(latestRunId).mockReturnValue(undefined)
    vi.mocked(markEvidence).mockClear()
    vi.mocked(rememberRun).mockClear()
  })

  it('shows the timer, pending variants and an opaque pipeline while the synchronous request is pending', () => {
    useTracker(makeTracker({ trackingId: TRACKING, phase: 'submitting' }))
    renderPage(TRACKING)

    expect(screen.getByRole('heading', { level: 1, name: 'Собираем три варианта' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:05')
    expect(screen.getByText('/ 5:00')).toBeInTheDocument()
    for (const name of ['Близко к шаблону', 'Сбалансированный', 'Визуальный']) {
      expect(screen.getByRole('article', { name: `${name}: В работе` })).toBeInTheDocument()
    }
    expect(screen.getByText('Конвейер в работе')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('swaps the tracking id for the real run id once the service accepts', () => {
    useTracker(makeTracker({ trackingId: TRACKING, generationId: RUN, phase: 'running' }))
    renderPage(TRACKING)

    expect(rememberRun).toHaveBeenCalledWith(PROJECT, RUN)
    expect(screen.getByTestId('location')).toHaveTextContent(routes.run(PROJECT, RUN))
  })

  it('shows per-variant statuses and allows cancelling an asynchronous run', () => {
    useTracker(makeTracker({ generationId: RUN, generation: running, phase: 'running', canCancel: true, job: { ...running, id: 'job', kind: 'generation', stage: 'audit', progress: 0.5, result_ids: {} } }))
    renderPage(RUN)

    expect(screen.getByRole('article', { name: 'Близко к шаблону: Готово' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Сбалансированный: Идёт' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Визуальный: В очереди' })).toBeInTheDocument()
    expect(screen.getByText('Сейчас: аудит')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeEnabled()
    expect(rememberRun).not.toHaveBeenCalled()
  })

  it('reports the total server time and links to the comparison when done', () => {
    const startedAt = Date.parse(completed.created_at)
    useTracker(makeTracker({ generationId: RUN, generation: completed, phase: 'completed', startedAt, finishedAt: startedAt + 8_196 }))
    renderPage(RUN)

    expect(screen.getByRole('heading', { level: 1, name: 'Три варианта готовы' })).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:08')
    expect(screen.getByText('8,2 с по данным сервиса')).toBeInTheDocument()
    expect(screen.getByText('В пределах бюджета 5:00: запас 4:51')).toBeInTheDocument()
    expect(screen.getAllByRole('article', { name: /: Готово$/ })).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Сравнить варианты →' })).toHaveAttribute('href', routes.variants(PROJECT, RUN))
    expect(screen.getByRole('link', { name: 'План колоды' })).toHaveAttribute('href', routes.plan(PROJECT, RUN))
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument()
    expect(markEvidence).toHaveBeenCalledWith(PROJECT, 'generated')
  })

  it('explains a failure from the error envelope and retries the same run', async () => {
    retryMutate.mockImplementation((_id: string, options: { onSuccess: (trackingId: string) => void }) => options.onSuccess('local-retry-2'))
    const failed = { ...generationFixture, state: 'failed' as const, variants: generationFixture.variants.map((variant) => ({ ...variant, status: 'failed' as const })) }
    const failedTracker = makeTracker({
      generationId: RUN,
      generation: failed,
      phase: 'failed',
      finishedAt: Date.now(),
      jobError: { code: 'llm_timeout', message: 'Модель не вернула план в срок', stage: 'deck_plan' },
    })
    vi.mocked(useGenerationTracker).mockImplementation((id) => (id === RUN ? failedTracker : makeTracker({ trackingId: id ?? null, phase: 'submitting' })))
    renderPage(RUN)

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Модель не вернула план в срок')).toBeInTheDocument()
    expect(within(alert).getByText('LLM_TIMEOUT · этап: план структуры')).toBeInTheDocument()
    expect(within(alert).getByRole('link', { name: 'Назад к брифу' })).toHaveAttribute('href', routes.brief(PROJECT))
    expect(screen.getByText('Остановлено на этапе «план структуры»')).toBeInTheDocument()
    expect(markEvidence).not.toHaveBeenCalled()

    await userEvent.click(within(alert).getByRole('button', { name: 'Повторить' }))
    expect(retryMutate).toHaveBeenCalledWith(RUN, expect.anything())
    expect(screen.getByTestId('location')).toHaveTextContent(routes.run(PROJECT, 'local-retry-2'))
    expect(screen.getByRole('heading', { level: 1, name: 'Собираем три варианта' })).toBeInTheDocument()
  })

  it('offers only the way back when a rejected request produced no run', () => {
    const error = new ApiError({ code: 'validation_error', message: 'Бриф не прошёл проверку', status: 422 })
    useTracker(makeTracker({ trackingId: TRACKING, phase: 'failed', error, finishedAt: Date.now() }))
    renderPage(TRACKING)

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Бриф не прошёл проверку')).toBeInTheDocument()
    expect(within(alert).queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('gives a recovery path when the page was reloaded during the synchronous request', () => {
    vi.mocked(latestRunId).mockReturnValue('run_previous')
    const error = new ApiError({ code: 'tracking_lost', message: 'Страница была перезагружена до ответа сервиса, результат этого запуска недоступен', status: 0 })
    useTracker(makeTracker({ phase: 'failed', error, startedAt: null }))
    renderPage(TRACKING)

    expect(screen.getByRole('heading', { level: 1, name: 'Статус запуска неизвестен' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Связь с запуском потеряна' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Открыть последний прогон' })).toHaveAttribute('href', routes.run(PROJECT, 'run_previous'))
    expect(screen.getByRole('link', { name: 'Назад к брифу' })).toHaveAttribute('href', routes.brief(PROJECT))
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })
})
