import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { useContentPack } from '@/entities/content-pack'
import { useGenerationTracker, useRetryGeneration, type GenerationTracker } from '@/entities/generation'
import { contentPackFixture, generationFixture } from '@/shared/api/mocks'
import { routes } from '@/shared/config'
import { ToastProvider } from '@/shared/ui'
import { PlanPage } from './PlanPage'
import type * as GenerationModule from '@/entities/generation'
import type * as ContentPackModule from '@/entities/content-pack'

vi.mock('@/entities/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof GenerationModule>()),
  useGenerationTracker: vi.fn(),
  useRetryGeneration: vi.fn(),
}))

vi.mock('@/entities/content-pack', async (importOriginal) => ({
  ...(await importOriginal<typeof ContentPackModule>()),
  useContentPack: vi.fn(),
}))

const PROJECT = 'prj_1'
const RUN = generationFixture.id
const retryMutate = vi.fn()

function makeTracker(overrides: Partial<GenerationTracker>): GenerationTracker {
  return {
    trackingId: null,
    generationId: RUN,
    jobId: null,
    variantIds: [],
    phase: 'completed',
    startedAt: null,
    finishedAt: null,
    generation: generationFixture,
    job: undefined,
    error: null,
    jobError: null,
    canCancel: false,
    ...overrides,
  }
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderPage(runId = RUN) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[routes.plan(PROJECT, runId)]}>
          <Routes>
            <Route path="/projects/:projectId/runs/:runId/plan" element={<PlanPage />} />
            <Route path="*" element={<div>other screen</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('PlanPage', () => {
  beforeEach(() => {
    retryMutate.mockReset()
    vi.mocked(useRetryGeneration).mockReturnValue({ mutate: retryMutate, isPending: false } as unknown as ReturnType<typeof useRetryGeneration>)
    vi.mocked(useContentPack).mockReturnValue({ data: contentPackFixture.content_pack } as unknown as ReturnType<typeof useContentPack>)
  })

  it('renders the recorded plan read-only with sources and provenance', () => {
    vi.mocked(useGenerationTracker).mockReturnValue(makeTracker({}))
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Сначала план, потом вёрстка' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Показан план варианта «Близко к шаблону»; у остальных вариантов свои планы')

    const list = screen.getByRole('list', { name: 'Слайды плана' })
    expect(within(list).getAllByText(/^\d{2}$/)).toHaveLength(12)
    expect(within(list).getByText('Раздел · Проблема')).toBeInTheDocument()
    expect(within(list).getAllByText('↳ Проблема').length).toBeGreaterThan(0)
    expect(within(list).getByText('Спасибо за внимание')).toBeInTheDocument()

    const aside = screen.getByRole('complementary', { name: 'Почему такая структура' })
    expect(within(aside).getByText(/Назначение «продукт», аудитория «руководство»/)).toBeInTheDocument()
    expect(within(aside).getByText('12 из 12')).toBeInTheDocument()
    expect(within(aside).getByText('story-director/deterministic-0.1.0')).toBeInTheDocument()
  })

  it('keeps edit affordances visibly disabled with an explanation', () => {
    vi.mocked(useGenerationTracker).mockReturnValue(makeTracker({}))
    renderPage()

    for (const name of ['Сбросить правки', 'Добавить слайд']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveAccessibleDescription('Скоро: правка плана до вёрстки')
    }
    expect(screen.getAllByRole('button', { name: 'Убрать слайд' })).toHaveLength(12)
  })

  it('rebuilds with the same inputs', async () => {
    retryMutate.mockImplementation((_id: string, options: { onSuccess: (trackingId: string) => void }) => options.onSuccess('local-rebuild-1'))
    vi.mocked(useGenerationTracker).mockReturnValue(makeTracker({}))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Пересобрать с теми же данными →' }))
    expect(retryMutate).toHaveBeenCalledWith(RUN, expect.anything())
    expect(screen.getByTestId('location')).toHaveTextContent(routes.run(PROJECT, 'local-rebuild-1'))
  })

  it('waits for the generation before showing a plan', () => {
    vi.mocked(useGenerationTracker).mockReturnValue(makeTracker({ generationId: null, generation: undefined, trackingId: 'local-1', phase: 'submitting' }))
    renderPage('local-1')

    expect(screen.getByText('План появится после генерации')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К генерации' })).toHaveAttribute('href', routes.run(PROJECT, 'local-1'))
    expect(screen.queryByRole('button', { name: /Пересобрать/ })).not.toBeInTheDocument()
  })
})
