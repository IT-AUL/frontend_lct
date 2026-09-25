import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resolveDeckFiles } from '@/entities/variant'
import type * as SharedApiModule from '@/shared/api'
import { variantFixtures } from '@/shared/api/mocks'
import { ExportFileCard, type ExportFileCardProps } from './ExportFileCard'

type SharedApi = typeof SharedApiModule

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  postMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<SharedApi>()
  return { ...actual, api: { GET: getMock, POST: postMock } }
})

function respond(status: number, body: unknown) {
  const ok = status >= 200 && status < 300
  return Promise.resolve({ data: ok ? body : undefined, error: ok ? undefined : body, response: new Response(null, { status }) })
}

const notImplemented = { error: { code: 'not_implemented', message: 'Export format is not implemented', retryable: false, details: {} } }
const { variant, export: record } = variantFixtures.balanced
const files = resolveDeckFiles(variant, [record])
const projectId = 'prj_export_test'

function renderCard(props: Partial<ExportFileCardProps>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ExportFileCard
        projectId={projectId}
        variantId={variant.id}
        format="pdf"
        file={files.pdf}
        currentRevision={1}
        supported
        fileName="deckdna_balanced_r1.pdf"
        note="Для рассылки и печати"
        {...props}
      />
    </QueryClientProvider>,
  )
}

function card() {
  return screen.getByRole('article')
}

function evidence(): Record<string, Record<string, boolean>> {
  return JSON.parse(localStorage.getItem('deckdna.evidence.v1') ?? '{}') as Record<string, Record<string, boolean>>
}

describe('ExportFileCard', () => {
  afterEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    localStorage.clear()
  })

  it('offers a download link with size and checksum when the file is ready', () => {
    renderCard({})

    const link = screen.getByRole('link', { name: 'Скачать' })
    expect(card()).toHaveAttribute('data-status', 'ready')
    expect(link).toHaveAttribute('href', `/api/v1/artifacts/${files.pdf?.artifactId}/download`)
    expect(link).toHaveAttribute('download', 'deckdna_balanced_r1.pdf')
    expect(screen.getByText('317 КБ · sha256 · ff7d…afa7')).toBeInTheDocument()
  })

  it('goes idle → creating → ready for a new PPTX export and records the evidence', async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    postMock.mockReturnValueOnce(new Promise((resolve) => (release = () => resolve(respond(202, { export_id: 'exp_new', job_id: 'job_new' })))))
    const pptxRecord = {
      ...record,
      id: 'exp_new',
      artifacts: [{ format: 'pptx', artifact_id: 'art_new_pptx', sha256: 'abcdef0123456789', size_bytes: 3_984_588, mime_type: 'application/pptx', download_url: '' }],
    }
    getMock.mockReturnValueOnce(respond(200, pptxRecord))

    renderCard({ format: 'pptx', file: null, fileName: 'deckdna_balanced_r1.pptx', note: 'Нативные объекты' })
    expect(card()).toHaveAttribute('data-status', 'idle')

    await user.click(screen.getByRole('button', { name: 'Собрать PPTX' }))
    expect(card()).toHaveAttribute('data-status', 'creating')
    expect(screen.getByRole('button', { name: 'Собираем…' })).toBeDisabled()

    release()
    const link = await screen.findByRole('link', { name: 'Скачать' })
    expect(card()).toHaveAttribute('data-status', 'ready')
    expect(link).toHaveAttribute('href', '/api/v1/artifacts/art_new_pptx/download')
    expect(screen.getByText('3,8 МБ · sha256 · abcd…6789')).toBeInTheDocument()
    expect(postMock).toHaveBeenCalledWith('/api/v1/variants/{variant_id}/exports', expect.objectContaining({ body: { formats: ['pptx'] } }))
    expect(evidence()[projectId]?.exported).toBe(true)
  })

  it('records the exported evidence when the PPTX is downloaded', async () => {
    const user = userEvent.setup()
    renderCard({ projectId: 'prj_download_test', format: 'pptx', file: files.pptx, fileName: 'deckdna_balanced.pptx', note: 'Нативные объекты' })

    const link = screen.getByRole('link', { name: 'Скачать' })
    link.addEventListener('click', (event) => event.preventDefault())
    await user.click(link)

    expect(evidence().prj_download_test?.exported).toBe(true)
  })

  it('shows HTML as coming soon without an action when capabilities do not offer it', () => {
    renderCard({ format: 'html', file: null, supported: false, fileName: 'deckdna_balanced.html', note: 'Слайды разметкой' })

    expect(card()).toHaveAttribute('data-status', 'unavailable')
    expect(screen.getByText('Скоро')).toBeInTheDocument()
    expect(screen.getByText('HTML-экспорт недоступен')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('turns a 501 for a stale PDF into an honest unavailable state and keeps the old file', async () => {
    const user = userEvent.setup()
    postMock.mockReturnValueOnce(respond(501, notImplemented))
    renderCard({ currentRevision: 2 })

    expect(card()).toHaveAttribute('data-status', 'idle')
    expect(screen.getByText('Файл собран для ревизии r1, текущая — r2.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Пересобрать для r2' }))

    await waitFor(() => expect(card()).toHaveAttribute('data-status', 'unavailable'))
    expect(screen.getByText('PDF относится к прошлой ревизии')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Скачать r1' })).toHaveAttribute('href', `/api/v1/artifacts/${files.pdf?.artifactId}/download`)
  })

  it('shows other failures with a retry', async () => {
    const user = userEvent.setup()
    const failure = { error: { code: 'internal_error', message: 'Рендер PDF упал', retryable: true, details: {} } }
    postMock.mockReturnValueOnce(respond(500, failure)).mockReturnValueOnce(respond(202, { export_id: record.id, job_id: record.job_id }))
    getMock.mockReturnValueOnce(respond(200, record))
    renderCard({ file: null })

    await user.click(screen.getByRole('button', { name: 'Собрать PDF' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Рендер PDF упал')
    expect(card()).toHaveAttribute('data-status', 'error')

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('link', { name: 'Скачать' })).toBeInTheDocument()
    expect(card()).toHaveAttribute('data-status', 'ready')
  })
})
