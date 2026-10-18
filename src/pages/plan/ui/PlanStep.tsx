import { useEffect, useState, type ReactNode } from 'react'
import { usePatchPlanSlide, usePlanSlideAction } from '@/entities/assistant'
import { hasChartData, type DeckPlan, type GenerationCreate } from '@/entities/generation'
import { applyQuickAction, changeSlideChart, usePlanDraft, useResearchPlanSlide, type QuickSlideAction } from '@/features/edit-deck-plan'
import { humanError } from '@/shared/api'
import { pluralize } from '@/shared/lib/format'
import { Button, SlideGrid, SlideTile } from '@/shared/ui'
import { plannedVisual } from '@/widgets/deck-plan'
import { keyFigure } from '@/widgets/draft-deck'
import { StepShell } from '@/widgets/step-shell'
import styles from './PlanPage.module.css'
import { SlideEditor } from './SlideEditor'

interface PlanStepProps {
  draftKey: string
  basePlan: DeckPlan
  buildBody: Omit<GenerationCreate, 'deck_plan' | 'deck_plan_id'>
  planId: string | null
  strategy: string | null
  keyMessage: string | null
  assistantNote: string | null
  notice: string | null
  extra?: ReactNode
  onSelectStyle: (plan: DeckPlan) => void
  onAutopilot: (plan: DeckPlan) => void
  autopilotPending: boolean
  onServerPlanSet: (planSet: unknown, optimisticPlan: DeckPlan) => void
  onKeyMessageCommit: (keyMessage: string, nextPlan: DeckPlan) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
}

function planNote(plan: DeckPlan, edited: boolean, explicit: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim()
  const count = plan.slides.length
  const base = `План на ${count} ${pluralize(count, ['слайд', 'слайда', 'слайдов'])}.`
  if (plan.slides.some((slide) => slide.supports_key_message === false)) return `${base} Бледные слайды уводят от главной мысли — проверьте их.`
  if (plan.slides.some((slide) => slide.desired_visual === 'chart' && !hasChartData(slide))) return `${base} Для одного графика не хватает чисел — откройте слайд, я поищу.`
  if (edited) return `${base} Ваши правки сохраню при вёрстке.`
  return `${base} Нажмите на слайд, чтобы поправить заголовок, пункты или график.`
}

export function PlanStep(props: PlanStepProps) {
  const { draftKey, basePlan, buildBody, planId, strategy, keyMessage, assistantNote, notice, extra, onSelectStyle, onAutopilot, autopilotPending, onServerPlanSet, onKeyMessageCommit } =
    props
  const draft = usePlanDraft(draftKey, basePlan)
  const patchSlide = usePatchPlanSlide(planId ?? '')
  const slideAction = usePlanSlideAction(planId ?? '')
  const researchSlide = useResearchPlanSlide(planId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [researchSupported, setResearchSupported] = useState(true)
  const [researching, setResearching] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState(draft.plan.brief.key_message ?? keyMessage ?? '')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        if (isEditableTarget(event.target) || !draft.canUndo) return
        event.preventDefault()
        draft.undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft])

  const ordered = [...draft.plan.slides].sort((a, b) => a.index - b.index)
  const selected = ordered.find((slide) => slide.id === selectedId) ?? null
  const untitled = ordered.some((slide) => slide.title_intent.trim() === '')

  const changeChart = (slideId: string, chartType: string) => {
    setError(null)
    const optimistic = changeSlideChart(draft.plan, slideId, chartType)
    draft.changeChart(slideId, chartType)
    if (!planId) return
    patchSlide.mutate(
      { slideId, chart_type: chartType, ...(strategy ? { strategy } : {}) },
      {
        onSuccess: (planSet) => {
          if (planSet) onServerPlanSet(planSet, optimistic)
        },
        onError: (cause) => {
          draft.undo()
          setError(humanError(cause))
        },
      },
    )
  }

  const quickAction = (slideId: string, action: QuickSlideAction) => {
    setError(null)
    const optimistic = applyQuickAction(draft.plan, slideId, action)
    draft.quickAction(slideId, action)
    if (action === 'remove') setSelectedId(null)
    if (!planId) return
    slideAction.mutate(
      { slideId, action, ...(strategy ? { strategy } : {}) },
      {
        onSuccess: (planSet) => {
          if (planSet) onServerPlanSet(planSet, optimistic)
        },
        onError: (cause) => {
          draft.undo()
          setError(humanError(cause))
        },
      },
    )
  }

  const research = async (slideId: string) => {
    if (!planId || !researchSupported) return
    setError(null)
    setResearching(slideId)
    try {
      const result = await researchSlide.mutateAsync({
        slideId,
        strategy,
        focus: 'numbers',
        useLlm: buildBody.use_llm ?? false,
        providerSessionId: buildBody.provider_session_id ?? null,
      })
      if (!result) {
        setResearchSupported(false)
        return
      }
      if (result.slide) {
        const serverSlide = result.slide
        const nextPlan: DeckPlan = { ...draft.plan, slides: draft.plan.slides.map((item) => (item.id === slideId ? serverSlide : item)) }
        draft.replace(nextPlan, true)
        onServerPlanSet(result.plan_set, nextPlan)
      }
    } catch (cause) {
      setError(humanError(cause))
    } finally {
      setResearching(null)
    }
  }

  const commitMessage = () => {
    const next = message.trim()
    if (next === (draft.plan.brief.key_message ?? '').trim()) return
    draft.updateKeyMessage(next)
    onKeyMessageCommit(next, { ...draft.plan, brief: { ...draft.plan.brief, key_message: next } })
  }

  const busy = autopilotPending
  const disabled = busy || untitled

  return (
    <StepShell
      title="План презентации"
      note={untitled ? 'У каждого слайда должен быть заголовок.' : planNote(draft.plan, draft.edited, assistantNote)}
      canvasLabel="План презентации"
      canvas={
        <SlideGrid label="Слайды">
          {ordered.map((slide, position) => {
            const visual = plannedVisual(slide)
            const points = slide.content_units.filter((unit) => (unit.kind === 'bullet' || unit.kind === 'paragraph') && (unit.text ?? '').trim()).length
            const figure = keyFigure(slide.title_intent)
            const meta = [visual && visual !== 'Текст' ? visual : null, points ? `${points} ${pluralize(points, ['пункт', 'пункта', 'пунктов'])}` : null].filter(Boolean).join(', ')
            return (
              <div role="listitem" key={slide.id}>
                <SlideTile
                  title={slide.title_intent || 'Без заголовка'}
                  selected={slide.id === selectedId}
                  muted={slide.supports_key_message === false}
                  pending={researching === slide.id}
                  onOpen={() => setSelectedId(slide.id)}
                  openLabel={`Слайд ${position + 1}: ${slide.title_intent}`}
                  caption={`${position + 1}. ${meta || 'Текст'}`}
                >
                  {figure ? <span className={styles.figure}>{figure}</span> : null}
                </SlideTile>
              </div>
            )
          })}
          <div role="listitem">
            <button type="button" className={styles.addSlide} onClick={draft.add}>
              Добавить слайд
            </button>
          </div>
        </SlideGrid>
      }
      inspector={
        selected
          ? {
              title: `Слайд ${ordered.indexOf(selected) + 1}`,
              onClose: () => setSelectedId(null),
              content: (
                <SlideEditor
                  key={selected.id}
                  plan={draft.plan}
                  slide={selected}
                  first={ordered.indexOf(selected) === 0}
                  last={ordered.indexOf(selected) === ordered.length - 1}
                  researching={researching === selected.id}
                  canResearch={Boolean(planId) && researchSupported}
                  onUpdate={(patch) => draft.update(selected.id, patch)}
                  onUnitChange={(position, text) => draft.updateUnit(selected.id, position, text)}
                  onUnitAdd={() => draft.addUnit(selected.id)}
                  onUnitRemove={(position) => draft.removeUnit(selected.id, position)}
                  onMove={(delta) => draft.move(selected.id, delta)}
                  onChart={(type) => changeChart(selected.id, type)}
                  onAction={(action) => quickAction(selected.id, action)}
                  onResearch={() => void research(selected.id)}
                  onKeep={() => draft.keepSlideOnTopic(selected.id)}
                />
              ),
            }
          : null
      }
      actions={
        <>
          <Button variant="primary" size="lg" disabled={disabled} onClick={() => onSelectStyle(draft.plan)}>
            Выбрать стиль
          </Button>
          <Button variant="ghost" size="lg" disabled={disabled} onClick={() => onAutopilot(draft.plan)}>
            {autopilotPending ? 'Запускаю…' : 'Сделай сам'}
          </Button>
        </>
      }
    >
      <label className={styles.messageLabel}>
        <span>Главная мысль</span>
        <textarea
          className={styles.message}
          rows={3}
          value={message}
          placeholder="Что слушатели должны запомнить"
          onChange={(event) => setMessage(event.target.value)}
          onBlur={commitMessage}
        />
      </label>
      {extra}
      {(draft.canUndo || draft.edited) && (
        <div className={styles.links}>
          {draft.canUndo && (
            <button type="button" className={styles.link} onClick={draft.undo}>
              Отменить последнее
            </button>
          )}
          {draft.edited && (
            <button type="button" className={styles.link} onClick={draft.reset}>
              Вернуть исходный план
            </button>
          )}
        </div>
      )}
      {(error || notice) && (
        <p className={styles.error} role="alert">
          {error ?? notice}
        </p>
      )}
    </StepShell>
  )
}
