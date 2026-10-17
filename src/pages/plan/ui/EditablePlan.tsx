import { useEffect, useState, type ReactNode } from 'react'
import { usePatchPlanSlide, usePlanSlideAction } from '@/entities/assistant'
import { hasChartData, type DeckPlan, type GenerationCreate, type ResearchSource } from '@/entities/generation'
import { applyQuickAction, changeSlideChart, editSummary, useBuildFromPlan, usePlanDraft, useResearchPlanSlide, type QuickSlideAction } from '@/features/edit-deck-plan'
import { DeckPlanView } from '@/widgets/deck-plan'
import { pluralize } from '@/shared/lib/format'
import { ArrowRight, Button, Icon, PageHeader, Sparkles } from '@/shared/ui'
import styles from './PlanPage.module.css'
import { RebuildDialog } from './RebuildDialog'

interface EditablePlanProps {
  projectId: string
  draftKey: string
  basePlan: DeckPlan
  headings: ReadonlyMap<string, string>
  eyebrow: string
  buildLabel: string
  buildBody: Omit<GenerationCreate, 'deck_plan' | 'deck_plan_id'>
  notice: ReactNode
  toolbar?: ReactNode
  next?: ReactNode
  confirmDescription?: string
  intro?: ReactNode
  asideTop?: ReactNode
  sources?: readonly ResearchSource[]
  lockAll?: boolean
  description?: string
  planId?: string | null
  strategy?: string | null
  keyMessage?: string | null
  assistantNote?: string | null
  onSelectStyle?: (plan: DeckPlan) => void
  onAutopilot?: (plan: DeckPlan) => void
  autopilotPending?: boolean
  showDirectBuild?: boolean
  onServerPlanSet?: (planSet: unknown, optimisticPlan: DeckPlan) => void
  onKeyMessageCommit?: (keyMessage: string, nextPlan: DeckPlan) => void
}

function describeEdits(base: DeckPlan, plan: DeckPlan): string {
  const { removed, added, renamed, moved } = editSummary(base, plan)
  const parts = [
    removed > 0 && `убрано ${removed} ${pluralize(removed, ['слайд', 'слайда', 'слайдов'])}`,
    added > 0 && `добавлено ${added}`,
    renamed > 0 && `переписано ${renamed}`,
    moved && 'изменён порядок',
  ].filter(Boolean)
  return parts.length > 0 ? `Ваши правки: ${parts.join(', ')}.` : ''
}

function resolveAssistantLine(plan: DeckPlan, edited: boolean, explicitNote?: string | null): string {
  if (explicitNote && explicitNote.trim()) return explicitNote.trim()
  if (plan.slides.some((slide) => slide.supports_key_message === false)) {
    return 'Отметил слайд серым — он уводит в сторону от главной мысли, его можно убрать в один клик.'
  }
  if (plan.slides.some((slide) => slide.desired_visual === 'chart' && !hasChartData(slide))) {
    return 'На слайде пока нет чисел для графика — могу найти статистику в источниках или оформить пункты схемой.'
  }
  if (edited) {
    return 'Закрепил вашу формулировку — при вёрстке сохраню её смысл без переписывания.'
  }
  const count = plan.slides.length
  return `Вот план на ${count} ${pluralize(count, ['слайд', 'слайда', 'слайдов'])} вокруг вашей главной мысли — проверьте заголовки и типы графиков перед вёрсткой.`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function EditablePlan(props: EditablePlanProps) {
  const {
    projectId,
    draftKey,
    basePlan,
    headings,
    eyebrow,
    buildLabel,
    buildBody,
    notice,
    toolbar,
    next,
    confirmDescription,
    intro,
    asideTop,
    sources,
    lockAll = false,
    description,
    planId = null,
    strategy = null,
    keyMessage,
    assistantNote,
    onSelectStyle,
    onAutopilot,
    autopilotPending = false,
    showDirectBuild = false,
    onServerPlanSet,
    onKeyMessageCommit,
  } = props
  const draft = usePlanDraft(draftKey, basePlan)
  const { build, isPending } = useBuildFromPlan(projectId, draftKey)
  const patchSlide = usePatchPlanSlide(planId ?? '')
  const slideAction = usePlanSlideAction(planId ?? '')
  const researchSlide = useResearchPlanSlide(planId ?? '')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [researchSupported, setResearchSupported] = useState(true)
  const [researchingSlideId, setResearchingSlideId] = useState<string | null>(null)

  const untitled = draft.plan.slides.some((slide) => slide.title_intent.trim() === '')
  const busy = isPending || autopilotPending
  const buildDisabled = busy || untitled
  const runBuild = () => build(buildBody, draft.plan, { lockAll })
  const quietRebuild = Boolean(next) && !draft.edited

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

  const handleChartChange = (slideId: string, chartType: string) => {
    setMutationError(null)
    const optimistic = changeSlideChart(draft.plan, slideId, chartType)
    draft.changeChart(slideId, chartType)
    if (!planId) return
    patchSlide.mutate(
      { slideId, chart_type: chartType, ...(strategy ? { strategy } : {}) },
      {
        onSuccess: (planSet) => {
          if (planSet) onServerPlanSet?.(planSet, optimistic)
        },
        onError: (error) => {
          draft.undo()
          setMutationError(error instanceof Error ? error.message : String(error))
        },
      },
    )
  }

  const handleQuickAction = (slideId: string, action: QuickSlideAction) => {
    setMutationError(null)
    const optimistic = applyQuickAction(draft.plan, slideId, action)
    draft.quickAction(slideId, action)
    if (!planId) return
    slideAction.mutate(
      { slideId, action, ...(strategy ? { strategy } : {}) },
      {
        onSuccess: (planSet) => {
          if (planSet) onServerPlanSet?.(planSet, optimistic)
        },
        onError: (error) => {
          draft.undo()
          setMutationError(error instanceof Error ? error.message : String(error))
        },
      },
    )
  }

  const handleResearch = async (slideId: string) => {
    if (!planId || !researchSupported) return
    setMutationError(null)
    setResearchingSlideId(slideId)
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
      const serverSlide = result.slide
      if (serverSlide) {
        const nextPlan: DeckPlan = {
          ...draft.plan,
          slides: draft.plan.slides.map((item) => (item.id === slideId ? serverSlide : item)),
        }
        draft.replace(nextPlan, true)
        onServerPlanSet?.(result.plan_set, nextPlan)
      }
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : String(error))
    } finally {
      setResearchingSlideId(null)
    }
  }

  const handleKeyMessageChange = (nextMessage: string) => {
    setMutationError(null)
    draft.updateKeyMessage(nextMessage)
    onKeyMessageCommit?.(nextMessage, { ...draft.plan, brief: { ...draft.plan.brief, key_message: nextMessage } })
  }

  const assistantLine = resolveAssistantLine(draft.plan, draft.edited, assistantNote)
  const combinedNotice = mutationError ?? notice

  return (
    <div className={styles.page}>
      {onSelectStyle && (
        <p className={styles.assistantNote} aria-live="polite" aria-label="Строка помощника">
          <Icon as={Sparkles} size={14} />
          <span key={assistantLine} className={styles.assistantNoteText}>
            {assistantLine}
          </span>
        </p>
      )}
      <PageHeader
        eyebrow={eyebrow}
        title="План колоды"
        description={description ?? 'Поправьте порядок, заголовки, пункты и визуал — варианты соберутся по вашему плану.'}
        actions={
          <>
            {(draft.edited || !onSelectStyle) && (
              <Button variant="secondary" size="lg" disabled={!draft.edited || busy} onClick={draft.reset}>
                Сбросить правки
              </Button>
            )}
            {onSelectStyle ? (
              <>
                {showDirectBuild && (
                  <Button variant="ghost" size="lg" disabled={buildDisabled} onClick={runBuild}>
                    {isPending ? 'Запускаем…' : buildLabel}
                  </Button>
                )}
                {onAutopilot && (
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={buildDisabled}
                    title="Приму настройки по умолчанию и соберу колоду по подтверждённым фактам"
                    onClick={() => onAutopilot(draft.plan)}
                  >
                    {autopilotPending ? 'Запускаю сборку…' : 'Сделай сам'}
                  </Button>
                )}
                <Button variant="primary" size="lg" disabled={buildDisabled} onClick={() => onSelectStyle(draft.plan)}>
                  Выбрать стиль
                  <Icon as={ArrowRight} size={15} />
                </Button>
              </>
            ) : quietRebuild ? (
              <>
                <RebuildDialog
                  label="Пересобрать с теми же данными"
                  title="Пересобрать три варианта?"
                  description={confirmDescription ?? ''}
                  confirmLabel="Пересобрать"
                  disabled={buildDisabled}
                  pending={isPending}
                  onConfirm={runBuild}
                />
                {next}
              </>
            ) : (
              <Button variant="primary" size="lg" disabled={buildDisabled} onClick={runBuild}>
                {isPending ? 'Запускаем…' : buildLabel}
              </Button>
            )}
          </>
        }
      />
      {(combinedNotice || draft.edited || untitled) && (
        <div className={styles.banner} role="note">
          <div className={styles.bannerText}>
            {combinedNotice} {draft.edited && describeEdits(basePlan, draft.plan)}
            {untitled && ' У каждого слайда должен быть заголовок.'}
          </div>
        </div>
      )}
      {intro}
      {toolbar}
      <DeckPlanView
        sources={sources}
        asideTop={asideTop}
        plan={draft.plan}
        headings={headings}
        keyMessage={onSelectStyle ? (draft.plan.brief.key_message ?? keyMessage) : undefined}
        editor={{
          onMove: draft.move,
          onRemove: draft.remove,
          onUpdate: draft.update,
          onAdd: draft.add,
          onUnitChange: draft.updateUnit,
          onUnitAdd: draft.addUnit,
          onUnitRemove: draft.removeUnit,
          onUnitMove: draft.moveUnit,
          onChartChange: handleChartChange,
          onQuickAction: handleQuickAction,
          onResearch: planId && researchSupported ? handleResearch : undefined,
          researchingSlideId,
          onKeyMessageChange: onSelectStyle ? handleKeyMessageChange : undefined,
          onKeepOnTopic: draft.keepSlideOnTopic,
          canUndo: draft.canUndo,
          onUndo: draft.undo,
        }}
      />
    </div>
  )
}
