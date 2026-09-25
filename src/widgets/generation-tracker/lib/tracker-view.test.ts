import { budgetStatus } from '@/entities/generation'
import { ApiError } from '@/shared/api'
import { generationFixture } from '@/shared/api/mocks'
import { describeFailure, failureMeta, isTrackingLost } from './failure'
import { pipelineView } from './pipeline'
import { budgetTicks, budgetTone, budgetVerdict } from './timer'
import { variantCards } from './variants'

describe('budget timer', () => {
  it('lays out minute ticks up to the TZ limit', () => {
    expect(budgetTicks(300).map((tick) => tick.label)).toEqual(['0:00', '1:00', '2:00', '3:00', '4:00', 'лимит ТЗ 5:00'])
    expect(budgetTicks(90, 30).map((tick) => tick.seconds)).toEqual([0, 30, 60, 90])
  })

  it('turns amber near the budget and red past it', () => {
    expect(budgetTone(budgetStatus(8.2, 300))).toBe('normal')
    expect(budgetTone(budgetStatus(250, 300))).toBe('warn')
    expect(budgetTone(budgetStatus(301, 300))).toBe('exceeded')
  })

  it('states the verdict against the budget', () => {
    expect(budgetVerdict(8.2, budgetStatus(8.2, 300), true)).toBe('В пределах бюджета 5:00: запас 4:51')
    expect(budgetVerdict(62, budgetStatus(62, 300), false)).toBe('До лимита 5:00 осталось 3:58')
    expect(budgetVerdict(330, budgetStatus(330, 300), false)).toBe('Бюджет 5:00 превышен на 0:30')
  })
})

describe('pipeline view', () => {
  it('shows the whole pipeline as in progress while the stage is unknown', () => {
    const view = pipelineView({ phase: 'submitting', stage: null, failedStage: null })
    expect(view.mode).toBe('opaque')
    expect(view.steps.every((step) => step.state === 'idle')).toBe(true)
    expect(view.steps.map((step) => step.label)).toEqual(['Разбор контента', 'План структуры', 'Вёрстка', 'Аудит', 'Рендер', 'Паспорт качества'])
  })

  it('marks earlier stages done and the reported stage active', () => {
    const view = pipelineView({ phase: 'running', stage: 'compose_layout', failedStage: null })
    expect(view.mode).toBe('tracked')
    expect(view.steps.map((step) => step.state)).toEqual(['done', 'done', 'active', 'pending', 'pending', 'pending'])
    expect(view.currentLabel).toBe('Вёрстка')
  })

  it('keeps an unmapped stage readable without guessing its position', () => {
    const view = pipelineView({ phase: 'running', stage: 'model_warmup', failedStage: null })
    expect(view.mode).toBe('opaque')
    expect(view.currentLabel).toBe('Model warmup')
  })

  it('marks the failing stage', () => {
    const view = pipelineView({ phase: 'failed', stage: 'render', failedStage: 'deck_plan' })
    expect(view.mode).toBe('stopped')
    expect(view.steps.map((step) => step.state)).toEqual(['done', 'error', 'pending', 'pending', 'pending', 'pending'])
  })

  it('completes every stage when the run is done', () => {
    const view = pipelineView({ phase: 'completed', stage: null, failedStage: null })
    expect(view.steps.every((step) => step.state === 'done')).toBe(true)
  })
})

describe('variant cards', () => {
  it('shows the three strategies as in progress before the service answers', () => {
    const cards = variantCards('submitting', undefined)
    expect(cards.map((card) => [card.strategy.id, card.state])).toEqual([
      ['faithful', 'pending'],
      ['balanced', 'pending'],
      ['visual', 'pending'],
    ])
  })

  it('follows real variant statuses in strategy order', () => {
    const [faithful, balanced, visual] = generationFixture.variants
    if (!faithful || !balanced || !visual) throw new Error('fixture must contain three variants')
    const cards = variantCards('running', [
      { ...visual, status: 'queued' },
      { ...faithful, status: 'completed' },
      { ...balanced, status: 'running' },
    ])
    expect(cards.map((card) => [card.strategy.id, card.state])).toEqual([
      ['faithful', 'done'],
      ['balanced', 'running'],
      ['visual', 'queued'],
    ])
  })

  it('waits for the in-pipeline audit before calling a variant done', () => {
    const [faithful] = generationFixture.variants
    if (!faithful) throw new Error('fixture must contain a variant')
    expect(variantCards('running', [{ ...faithful, audit_status: 'running' }])[0]?.state).toBe('running')
    expect(variantCards('failed', [{ ...faithful, status: 'failed' }])[0]?.state).toBe('error')
  })

  it('shows no placeholders once a run without variants has stopped', () => {
    expect(variantCards('failed', undefined)).toEqual([])
    expect(variantCards('failed', [])).toEqual([])
  })
})

describe('failure description', () => {
  it('prefers the job error reported by the service', () => {
    const failure = describeFailure({
      jobError: { code: 'llm_timeout', message: 'Модель не вернула план в срок', stage: 'deck_plan' },
      error: null,
      job: undefined,
    })
    expect(failure).toEqual({ code: 'llm_timeout', message: 'Модель не вернула план в срок', stage: 'План структуры', retryable: null })
    expect(failureMeta(failure)).toBe('LLM_TIMEOUT · этап: план структуры')
  })

  it('reads the error envelope of a rejected request', () => {
    const error = new ApiError({ code: 'provider_unavailable', message: 'Провайдер недоступен', status: 503, stage: 'render_pdf', retryable: true })
    const failure = describeFailure({ jobError: null, error, job: undefined })
    expect(failureMeta(failure)).toBe('PROVIDER_UNAVAILABLE · этап: рендер · можно повторить')
  })

  it('falls back to a neutral message', () => {
    expect(describeFailure({ jobError: null, error: null, job: undefined }).message).toBe('Сервис сообщил об ошибке без подробностей.')
    expect(failureMeta({ code: null, message: '', stage: null, retryable: null })).toBeNull()
  })

  it('recognises a lost tracking id', () => {
    expect(isTrackingLost(new ApiError({ code: 'tracking_lost', message: 'x', status: 0 }))).toBe(true)
    expect(isTrackingLost(new Error('tracking_lost'))).toBe(false)
    expect(isTrackingLost(null)).toBe(false)
  })
})
