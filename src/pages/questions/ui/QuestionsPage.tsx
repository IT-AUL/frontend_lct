import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  assistantKeys,
  useAddNotes,
  useAssistantSession,
  useQuestions,
  useStartAutopilot,
  useSubmitAnswers,
  type Question,
} from '@/entities/assistant'
import { isApiError, requestJson } from '@/shared/api'
import { rememberRun, useInvalidateProject, useProject } from '@/entities/project'
import { useActiveProviderSession } from '@/entities/provider-session'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { isAbortError, PlanBuildProgress, requestAndStorePlan, usePlanBuild } from '@/features/edit-deck-plan'
import { routes } from '@/shared/config'
import {
  ArrowRight,
  Badge,
  Button,
  EmptyState,
  Icon,
  ListOrdered,
  Mono,
  PageHeader,
  RefreshCw,
  Skeleton,
  Sparkles,
  Wand2,
} from '@/shared/ui'
import {
  buildAnswersPayload,
  cleanThesisNotes,
  formatSuggestedSummary,
  initialSelections,
  isContentShortQuestion,
  mapShortChoiceToFillMode,
  normalizeAnsweredBrief,
  normalizeContentShortOptions,
  resolveQuestionsNote,
  visibleQuestions,
  type QuestionSelection,
} from '../lib/questions'
import { QuestionCard } from './QuestionCard'
import styles from './QuestionsPage.module.css'

function errorMessage(error: unknown): string | null {
  if (!error || isAbortError(error)) return null
  return error instanceof Error ? error.message : String(error)
}

export function QuestionsPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invalidateProject = useInvalidateProject()

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId)
  const { data: session, isLoading: sessionLoading } = useAssistantSession(projectId)
  const providerSession = useActiveProviderSession()
  const modelAuto = useCapabilityFlag(FEATURE_PATHS.modelAuto)
  const useLlm = Boolean(providerSession) || modelAuto

  const questionsQuery = useQuestions(projectId)
  const submitAnswers = useSubmitAnswers(projectId)
  const activePackId = session?.artifacts.content_pack_id ?? project?.content_pack_id ?? null
  const templateId = session?.artifacts.template_id ?? project?.template_id ?? null
  const addNotes = useAddNotes(activePackId ?? '')
  const autopilot = useStartAutopilot(projectId)
  const planBuild = usePlanBuild()

  const rawQuestions = useMemo(() => {
    const qList = questionsQuery.data?.questions ?? []
    const suggested = questionsQuery.data?.suggested_brief
    if (
      qList.length > 0 &&
      !qList.some(isContentShortQuestion) &&
      suggested?.content_fill === 'ask'
    ) {
      const syntheticShort: Question = {
        id: 'content_short',
        kind: 'content_short',
        reason: 'Материала меньше, чем запрошено слайдов — выберите, как поступить.',
        options: normalizeContentShortOptions([]),
        allow_custom: false,
        optional: false,
      }
      return [syntheticShort, ...qList]
    }
    return qList
  }, [questionsQuery.data])

  const questions = useMemo(() => visibleQuestions(rawQuestions), [rawQuestions])
  const [userSelections, setUserSelections] = useState<Record<string, QuestionSelection>>({})
  const selections = useMemo(
    () => ({ ...initialSelections(questions), ...userSelections }),
    [questions, userSelections],
  )
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set())
  const [thesisNotes, setThesisNotes] = useState<[string, string, string]>(['', '', ''])
  const [showShortFork, setShowShortFork] = useState(false)
  const [shortForkChoice, setShortForkChoice] = useState<string>('shrink')
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [buildingPlan, setBuildingPlan] = useState(false)
  const autoSkippedRef = useRef(false)

  const suggestedBrief = questionsQuery.data?.suggested_brief
  const defaultLanguage = project?.default_language ?? 'ru'
  const targetSlideCount = project?.target_slide_count ?? 8
  const providerSessionId = providerSession?.id ?? null

  const runBuildPlan = useCallback(
    async (answersPayload: Record<string, string | number>, notesToSubmit: readonly string[]) => {
      setActionError(null)
      setBuildingPlan(true)
      const options = planBuild.begin()
      try {
        let packIdToUse = activePackId
        const cleanNotes = cleanThesisNotes(notesToSubmit)
        if (cleanNotes.length > 0 && packIdToUse) {
          const noteResult = await addNotes.mutateAsync({ items: cleanNotes })
          if (noteResult?.content_pack_id) {
            packIdToUse = noteResult.content_pack_id
          }
        }

        const answered = await submitAnswers.mutateAsync({ answers: answersPayload })
        if (answered?.assistant_note) {
          setFeedbackNote(answered.assistant_note)
        }

        if (templateId && packIdToUse) {
          planBuild.enterPhase('plan')
          const brief = normalizeAnsweredBrief(
            answered?.brief,
            suggestedBrief,
            defaultLanguage,
            targetSlideCount,
          )
          const shortAnswer = typeof answersPayload.content_short === 'string' ? answersPayload.content_short : undefined
          const contentFill = mapShortChoiceToFillMode(shortAnswer)
          const baseRequest = {
            template_id: templateId,
            content_pack_id: packIdToUse,
            brief,
            strategies: ['balanced' as const],
            use_llm: useLlm,
            ...(useLlm && providerSessionId ? { provider_session_id: providerSessionId } : {}),
          }
          try {
            await requestAndStorePlan(projectId, baseRequest, { contentFill }, options)
          } catch (planErr) {
            if (isApiError(planErr) && planErr.status === 422) {
              await requestAndStorePlan(
                projectId,
                {
                  ...baseRequest,
                  brief: {
                    ...brief,
                    purpose: brief.purpose || 'product',
                    audience: brief.audience || 'руководство',
                  },
                },
                { contentFill },
                options,
              )
            } else {
              throw planErr
            }
          }
        }

        void invalidateProject(projectId)
        navigate(routes.planDraft(projectId), { replace: questions.length === 0 })
      } catch (error) {
        const msg = errorMessage(error)
        if (msg) setActionError(msg)
      } finally {
        planBuild.finish()
        setBuildingPlan(false)
      }
    },
    [
      activePackId,
      addNotes,
      defaultLanguage,
      invalidateProject,
      navigate,
      planBuild,
      projectId,
      providerSessionId,
      questions.length,
      submitAnswers,
      suggestedBrief,
      targetSlideCount,
      templateId,
      useLlm,
    ],
  )

  useEffect(() => {
    if (
      !projectLoading &&
      !sessionLoading &&
      questionsQuery.isSuccess &&
      questionsQuery.data !== null &&
      questionsQuery.data.questions.length === 0 &&
      !autoSkippedRef.current
    ) {
      autoSkippedRef.current = true
      if (session) {
        queryClient.setQueryData(assistantKeys.session(projectId), {
          ...session,
          step: 4,
          completed_steps: [...new Set([...session.completed_steps, 1, 2])],
          skipped_steps: [...new Set([...session.skipped_steps, 3])],
        })
      }
      void runBuildPlan({}, [])
    }
  }, [
    projectLoading,
    sessionLoading,
    questionsQuery.isSuccess,
    questionsQuery.data,
    session,
    queryClient,
    projectId,
    runBuildPlan,
  ])

  const handleSelectOption = (questionId: string, value: string) => {
    setUserSelections((prev) => ({
      ...prev,
      [questionId]: { mode: 'option', value, customText: prev[questionId]?.customText ?? '' },
    }))
    setSkippedIds((prev) => {
      if (!prev.has(questionId)) return prev
      const next = new Set(prev)
      next.delete(questionId)
      return next
    })
  }

  const handleSelectCustom = (questionId: string) => {
    setUserSelections((prev) => ({
      ...prev,
      [questionId]: { mode: 'custom', value: prev[questionId]?.value ?? '', customText: prev[questionId]?.customText ?? '' },
    }))
  }

  const handleCustomTextChange = (questionId: string, customText: string) => {
    setUserSelections((prev) => ({
      ...prev,
      [questionId]: { mode: 'custom', value: prev[questionId]?.value ?? '', customText },
    }))
  }

  const handleToggleSkip = (questionId: string) => {
    setSkippedIds((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const handleThesisNoteChange = (slotIndex: 0 | 1 | 2, text: string) => {
    setThesisNotes((prev) => {
      const next: [string, string, string] = [prev[0], prev[1], prev[2]]
      next[slotIndex] = text
      return next
    })
  }

  const handleSubmit = () => {
    const payload = buildAnswersPayload(questions, selections, skippedIds)
    if (showShortFork && !questions.some(isContentShortQuestion)) {
      payload.content_short = shortForkChoice
    }
    const shortVal = typeof payload.content_short === 'string' ? payload.content_short : null
    const notes = shortVal === 'notes' ? thesisNotes : []
    void runBuildPlan(payload, notes)
  }

  const handleSkipAll = () => {
    void runBuildPlan({}, [])
  }

  const handleStartAutopilot = async () => {
    setActionError(null)
    try {
      const accepted = await autopilot.mutateAsync({
        from_step: 3,
        use_llm: useLlm,
        ...(useLlm && providerSession?.id ? { provider_session_id: providerSession.id } : {}),
      })
      if (!accepted) {
        navigate(routes.brief(projectId))
        return
      }
      if (accepted.assistant_note) setFeedbackNote(accepted.assistant_note)
      if (accepted.job_id) {
        try {
          const job = await requestJson<{ result_ids?: Record<string, string> }>(`/jobs/${encodeURIComponent(accepted.job_id)}`)
          const genId = job.result_ids?.generation_id
          if (genId) {
            rememberRun(projectId, genId)
            navigate(routes.run(projectId, genId))
            return
          }
        } catch {
          void 0
        }
        navigate(routes.run(projectId, accepted.job_id))
      }
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  if (projectError) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Уточнения" title="Пара вопросов" />
        <EmptyState title="Не удалось открыть проект" description={projectError.message} />
      </div>
    )
  }

  if (projectLoading || sessionLoading || questionsQuery.isLoading) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Загрузка вопросов">
        <PageHeader
          eyebrow="Уточнения"
          title="Пара вопросов"
          description="Проверяю, достаточно ли данных для построения плана…"
        />
        <Skeleton className={styles.skeletonCard} />
        <Skeleton className={styles.skeletonCard} delay={0.08} />
      </div>
    )
  }

  if (buildingPlan) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="План"
          title="Составляю план презентации"
          description={
            questions.length === 0
              ? 'Понял сам из ваших материалов — раскладываю историю по слайдам.'
              : 'Учёл ваши ответы — раскладываю историю по слайдам.'
          }
        />
        <PlanBuildProgress
          progress={planBuild.progress}
          phase={planBuild.phase}
          startedAt={planBuild.startedAt}
          onCancel={planBuild.cancel}
        />
      </div>
    )
  }

  if (questionsQuery.error) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Уточнения" title="Пара вопросов" />
        <EmptyState
          title="Не удалось загрузить вопросы"
          description={questionsQuery.error.message}
          actions={
            <div className={styles.footerActions}>
              <Button variant="primary" onClick={() => void questionsQuery.refetch()}>
                <Icon as={RefreshCw} size={14} />
                Повторить
              </Button>
              <Link className={styles.linkButton} to={routes.brief(projectId)}>
                Перейти к брифу
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (questionsQuery.data === null) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Уточнения"
          title="Пара вопросов"
          description="Уточняющие вопросы на этом стенде недоступны — продолжайте через классический бриф."
        />
        <EmptyState
          title="Шаг вопросов недоступен"
          description="Вы можете заполнить параметры брифа и сразу перейти к построению плана."
          actions={
            <div className={styles.footerActions}>
              <Link className={styles.linkButton} to={routes.brief(projectId)}>
                Перейти к брифу
              </Link>
              <Link className={styles.linkButton} to={routes.planDraft(projectId)}>
                К плану
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  const shortQuestion = questions.find(isContentShortQuestion)
  const selectedShortValue = shortQuestion
    ? (selections[shortQuestion.id]?.value ?? 'shrink')
    : showShortFork
      ? shortForkChoice
      : null
  const assistantNote = resolveQuestionsNote(questionsQuery.data, session?.assistant_note, selectedShortValue, feedbackNote)
  const suggestedSummary = formatSuggestedSummary(questionsQuery.data?.suggested_brief)

  if (questions.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Понял сам"
          title="Пара вопросов"
          description="Все ключевые параметры понятны из ваших материалов — лишних вопросов не задаю."
        />
        <section className={styles.autoSkippedCard} aria-label="Понял сам">
          <div className={styles.autoSkippedTop}>
            <Badge tone="ok" dot>
              Понял сам
            </Badge>
            <h2 className={styles.autoSkippedTitle}>Вопросов нет — перехожу сразу к плану</h2>
          </div>
          <p className={styles.autoSkippedText}>{assistantNote}</p>
          {suggestedSummary && <Mono>{suggestedSummary}</Mono>}
          <div className={styles.footerActions}>
            <Button variant="primary" onClick={() => navigate(routes.planDraft(projectId))}>
              Открыть план
              <Icon as={ArrowRight} size={14} />
            </Button>
          </div>
        </section>
      </div>
    )
  }

  const hasShortInQuestions = Boolean(shortQuestion)
  const manualShortQuestion: Question = {
    id: 'content_short',
    kind: 'content_short',
    reason: 'Если вашего материала меньше желаемого числа слайдов, выберите, как дополнить колоду.',
    options: normalizeContentShortOptions([]),
    allow_custom: false,
    optional: true,
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Уточнения"
        title="Пара вопросов"
        description="Спрашиваю только то, без чего презентация выйдет не о том. На каждый вопрос уже выбран ответ по умолчанию."
        actions={
          <div className={styles.footerActions}>
            <Button
              variant="ghost"
              size="md"
              disabled={submitAnswers.isPending || addNotes.isPending}
              onClick={handleSkipAll}
            >
              Пропустить вопросы
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={autopilot.isPending}
              title="Приму безопасные настройки по умолчанию и соберу колоду по подтверждённым фактам"
              onClick={() => void handleStartAutopilot()}
            >
              <Icon as={Wand2} size={14} />
              {autopilot.isPending ? 'Запускаю…' : 'Сделай сам'}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={submitAnswers.isPending || addNotes.isPending}
              onClick={handleSubmit}
            >
              <Icon as={ListOrdered} size={14} />
              Составить план
              <Icon as={ArrowRight} size={14} />
            </Button>
          </div>
        }
      />

      <section className={styles.assistantBar} aria-label="Помощник">
        <p className={styles.assistantNote} aria-live="polite">
          <Icon as={Sparkles} size={16} />
          <span>{assistantNote}</span>
        </p>
        {!hasShortInQuestions && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showShortFork}
            onClick={() => setShowShortFork((prev) => !prev)}
          >
            Как поступим при нехватке материала?
          </Button>
        )}
      </section>

      {actionError && (
        <p className={styles.errorBanner} role="alert">
          {actionError}
        </p>
      )}

      <div className={styles.questionsList}>
        {questions.map((question, idx) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={idx}
            total={questions.length}
            selection={selections[question.id] ?? { mode: 'option', value: question.options[0]?.value ?? '', customText: '' }}
            skipped={skippedIds.has(question.id)}
            thesisNotes={thesisNotes}
            disabled={submitAnswers.isPending || addNotes.isPending}
            onSelectOption={handleSelectOption}
            onSelectCustom={handleSelectCustom}
            onCustomTextChange={handleCustomTextChange}
            onToggleSkip={handleToggleSkip}
            onThesisNoteChange={handleThesisNoteChange}
          />
        ))}

        {!hasShortInQuestions && showShortFork && (
          <QuestionCard
            question={manualShortQuestion}
            index={questions.length}
            total={questions.length + 1}
            selection={{ mode: 'option', value: shortForkChoice, customText: '' }}
            skipped={false}
            thesisNotes={thesisNotes}
            disabled={submitAnswers.isPending || addNotes.isPending}
            onSelectOption={(_id, value) => setShortForkChoice(value)}
            onSelectCustom={() => void 0}
            onCustomTextChange={() => void 0}
            onToggleSkip={() => setShowShortFork(false)}
            onThesisNoteChange={handleThesisNoteChange}
          />
        )}
      </div>

      <footer className={styles.footerBar} aria-label="Действия шага">
        <div className={styles.footerMeta}>
          {suggestedSummary ? <Mono>{suggestedSummary}</Mono> : <span>Ответы по умолчанию уже выбраны</span>}
        </div>

        <div className={styles.footerActions}>
          <Button
            variant="ghost"
            size="lg"
            disabled={submitAnswers.isPending || addNotes.isPending}
            onClick={handleSkipAll}
          >
            Пропустить вопросы
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={autopilot.isPending}
            title="Приму безопасные настройки по умолчанию и соберу колоду по подтверждённым фактам"
            onClick={() => void handleStartAutopilot()}
          >
            <Icon as={Wand2} size={14} />
            {autopilot.isPending ? 'Запускаю сборку…' : 'Сделай сам'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={submitAnswers.isPending || addNotes.isPending}
            onClick={handleSubmit}
          >
            <Icon as={ListOrdered} size={16} />
            Составить план
            <Icon as={ArrowRight} size={16} />
          </Button>
        </div>
      </footer>
    </div>
  )
}
