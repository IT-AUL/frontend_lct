import type { JsonRecord, Question, QuestionOption, QuestionsResult } from '@/entities/assistant'
import type { ContentFillMode, GenerationBrief } from '@/entities/generation'
import { pluralize } from '@/shared/lib/format'

export const MAX_QUESTIONS_PER_TURN = 2

export interface QuestionSelection {
  mode: 'option' | 'custom'
  value: string
  customText: string
}

export interface ContentShortOptionMeta {
  value: 'shrink' | 'notes' | 'expand_web' | 'expand_model'
  title: string
  description: string
  badge?: string
}

export const QUESTION_TITLE: Record<string, string> = {
  audience: 'Для кого эта презентация?',
  key_message: 'Какую главную мысль вынести на обложку и держать через всю презентацию?',
  call_to_action: 'Что сделать слушателям после выступления?',
  length: 'Какой объём презентации подойдёт?',
  tone: 'Какой тон подачи выбрать?',
  content_short: 'Как поступим с объёмом материала?',
}

export const CONTENT_SHORT_META: Record<ContentShortOptionMeta['value'], ContentShortOptionMeta> = {
  shrink: {
    value: 'shrink',
    title: 'Сделать короче по материалу',
    description: 'Честно соберу презентацию только по вашим данным и фактам, без воды.',
    badge: 'советую',
  },
  notes: {
    value: 'notes',
    title: 'Я добавлю пару тезисов',
    description: 'Запишите 1–3 коротких тезиса своими словами — разверну их в слайды.',
  },
  expand_web: {
    value: 'expand_web',
    title: 'Поискать в интернете',
    description: 'Подтяну недостающие факты и статистику с прямыми ссылками на источники.',
  },
  expand_model: {
    value: 'expand_model',
    title: 'Дополнить общими знаниями',
    description: 'Помечу такие пункты плашкой «не подтверждено источником», чтобы вы проверили.',
    badge: 'не подтверждено источником',
  },
}

export function sanitizeQuestionCopy(raw: string): string {
  return raw
    .replace(/из знаний модели/gi, 'общими знаниями')
    .replace(/знания модели/gi, 'общие знания')
    .replace(/нейросеть/gi, 'сервис')
    .replace(/генерацией/gi, 'сборкой')
    .replace(/генерацию/gi, 'сборку')
    .replace(/генерации/gi, 'сборки')
    .replace(/генерация/gi, 'сборка')
}

export function questionTitle(question: Pick<Question, 'id' | 'kind'>): string {
  const key = question.kind ?? question.id
  return QUESTION_TITLE[key] ?? 'Уточните параметр презентации'
}

export function isContentShortQuestion(question: Pick<Question, 'id' | 'kind'>): boolean {
  return question.kind === 'content_short' || question.id === 'content_short'
}

export function normalizeContentShortOptions(options: readonly QuestionOption[]): QuestionOption[] {
  const byValue = new Map(options.map((opt) => [opt.value, opt]))
  const hasBackendRecommendation = options.some((opt) => opt.recommended)
  const order: readonly ContentShortOptionMeta['value'][] = ['shrink', 'notes', 'expand_web', 'expand_model']
  return order.map((key, idx) => {
    const existing = byValue.get(key)
    const meta = CONTENT_SHORT_META[key]
    return {
      value: key,
      label: existing ? sanitizeQuestionCopy(existing.label) : meta.title,
      recommended: existing ? existing.recommended : idx === 0 && !hasBackendRecommendation,
      note: existing?.note ? sanitizeQuestionCopy(existing.note) : meta.description,
    }
  })
}

export function visibleQuestions(questions: readonly Question[]): Question[] {
  return questions.slice(0, MAX_QUESTIONS_PER_TURN).map((question) => ({
    ...question,
    reason: question.reason ? sanitizeQuestionCopy(question.reason) : null,
    options: isContentShortQuestion(question)
      ? normalizeContentShortOptions(question.options)
      : question.options.map((opt) => ({
          ...opt,
          label: sanitizeQuestionCopy(opt.label),
          note: opt.note ? sanitizeQuestionCopy(opt.note) : null,
        })),
  }))
}

export function defaultOptionValue(question: Question): string {
  const recommended = question.options.find((option) => option.recommended)
  return recommended?.value ?? question.options[0]?.value ?? ''
}

export function initialSelections(questions: readonly Question[]): Record<string, QuestionSelection> {
  const result: Record<string, QuestionSelection> = {}
  for (const question of visibleQuestions(questions)) {
    result[question.id] = {
      mode: 'option',
      value: defaultOptionValue(question),
      customText: '',
    }
  }
  return result
}

export function buildAnswersPayload(
  questions: readonly Question[],
  selections: Readonly<Record<string, QuestionSelection>>,
  skippedIds: ReadonlySet<string>,
): Record<string, string | number> {
  const answers: Record<string, string | number> = {}
  for (const question of visibleQuestions(questions)) {
    if (skippedIds.has(question.id)) continue
    const sel = selections[question.id]
    const rawValue = sel ? (sel.mode === 'custom' ? sel.customText.trim() : sel.value) : defaultOptionValue(question)
    if (question.kind === 'length' || question.id === 'length') {
      const parsed = Number(rawValue)
      if (Number.isFinite(parsed) && parsed > 0) {
        answers[question.id] = parsed
        continue
      }
    }
    answers[question.id] = rawValue
  }
  return answers
}

export function cleanThesisNotes(notes: readonly string[]): string[] {
  return notes.map((item) => item.trim()).filter(Boolean)
}

export function normalizeAnsweredBrief(
  answeredBrief: JsonRecord | null | undefined,
  suggestedBrief: JsonRecord | null | undefined,
  fallbackLanguage = 'ru',
  fallbackSlideCount = 8,
): GenerationBrief & Record<string, unknown> {
  const merged: JsonRecord = { ...(suggestedBrief ?? {}), ...(answeredBrief ?? {}) }
  const rawCount = Number(merged.target_slide_count)
  const targetSlideCount = Number.isFinite(rawCount) && rawCount >= 3 && rawCount <= 40 ? Math.round(rawCount) : Math.max(3, Math.min(40, fallbackSlideCount))
  const rawFill = merged.content_fill
  const contentFill: 'expand' | 'shrink' | 'ask' | undefined =
    rawFill === 'shrink' || rawFill === 'expand' || rawFill === 'ask' ? rawFill : undefined

  return {
    purpose: typeof merged.purpose === 'string' && merged.purpose.trim() ? merged.purpose.trim() : 'presentation',
    audience: typeof merged.audience === 'string' ? merged.audience : '',
    language: typeof merged.language === 'string' && merged.language.trim() ? merged.language.trim() : fallbackLanguage,
    target_slide_count: targetSlideCount,
    ...(typeof merged.tone === 'string' && merged.tone.trim() ? { tone: merged.tone.trim() } : {}),
    ...(contentFill ? { content_fill: contentFill } : {}),
    ...(typeof merged.key_message === 'string' && merged.key_message.trim() ? { key_message: merged.key_message.trim() } : {}),
    ...(typeof merged.call_to_action === 'string' && merged.call_to_action.trim() ? { call_to_action: merged.call_to_action.trim() } : {}),
  }
}

export function mapShortChoiceToFillMode(choice: string | undefined): ContentFillMode | null {
  if (choice === 'shrink' || choice === 'notes') return 'keep'
  if (choice === 'expand_web' || choice === 'expand_model' || choice === 'expand') return 'expand'
  return null
}

export function formatSuggestedSummary(suggestedBrief: JsonRecord | null | undefined): string | null {
  if (!suggestedBrief) return null
  const parts: string[] = []
  const count = Number(suggestedBrief.target_slide_count)
  if (Number.isFinite(count) && count > 0) {
    parts.push(`Предложенный объём: ${count} ${pluralize(count, ['слайд', 'слайда', 'слайдов'])}`)
  }
  if (typeof suggestedBrief.audience === 'string' && suggestedBrief.audience.trim()) {
    parts.push(`Аудитория: ${suggestedBrief.audience.trim()}`)
  }
  if (typeof suggestedBrief.purpose === 'string' && suggestedBrief.purpose.trim()) {
    parts.push(`Тема: ${suggestedBrief.purpose.trim()}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export function resolveQuestionsNote(
  questionsResult: QuestionsResult | null | undefined,
  sessionNote: string | null | undefined,
  selectedShortValue: string | null,
  feedbackNote: string | null,
): string {
  if (feedbackNote) return sanitizeQuestionCopy(feedbackNote)
  if (selectedShortValue === 'notes') {
    return 'Запишите 1–3 коротких тезиса своими словами — я встрою их в ключевые слайды плана.'
  }
  if (questionsResult && questionsResult.questions.length === 0) {
    return 'Аудитория, объём и главная мысль уже ясны из материалов — перехожу сразу к плану.'
  }
  if (questionsResult?.assistant_note && questionsResult.assistant_note.trim()) {
    return sanitizeQuestionCopy(questionsResult.assistant_note.trim())
  }
  if (sessionNote && sessionNote.trim()) {
    return sanitizeQuestionCopy(sessionNote.trim())
  }
  return 'Пара быстрых уточнений, чтобы попасть в тон и фокус, — и сразу составлю план.'
}
