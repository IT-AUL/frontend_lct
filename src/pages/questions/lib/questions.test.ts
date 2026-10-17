import type { Question, QuestionOption, QuestionsResult } from '@/entities/assistant'
import {
  MAX_QUESTIONS_PER_TURN,
  buildAnswersPayload,
  cleanThesisNotes,
  defaultOptionValue,
  formatSuggestedSummary,
  initialSelections,
  isContentShortQuestion,
  mapShortChoiceToFillMode,
  normalizeAnsweredBrief,
  normalizeContentShortOptions,
  questionTitle,
  resolveQuestionsNote,
  sanitizeQuestionCopy,
  visibleQuestions,
  type QuestionSelection,
} from './questions'

function option(patch: Partial<QuestionOption> = {}): QuestionOption {
  return { value: 'a', label: 'Вариант А', recommended: false, note: null, ...patch }
}

function question(patch: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    kind: 'key_message',
    reason: 'Причина вопроса',
    options: [option({ value: 'a', label: 'Первый' }), option({ value: 'b', label: 'Второй', recommended: true })],
    allow_custom: true,
    optional: false,
    ...patch,
  }
}

function result(patch: Partial<QuestionsResult> = {}): QuestionsResult {
  return {
    questions: [question()],
    suggested_brief: {},
    deferred_questions: [],
    assistant_note: null,
    ...patch,
  }
}

describe('questionTitle', () => {
  it('resolves known kinds to Russian titles', () => {
    expect(questionTitle(question({ kind: 'key_message' }))).toContain('главную мысль')
    expect(questionTitle(question({ kind: 'audience' }))).toBe('Для кого эта презентация?')
    expect(questionTitle(question({ kind: 'content_short' }))).toContain('Как поступим')
  })

  it('falls back to a generic title for unknown kinds', () => {
    expect(questionTitle(question({ kind: 'unknown_kind' }))).toBe('Уточните параметр презентации')
    expect(questionTitle(question({ kind: null, id: 'audience' }))).toBe('Для кого эта презентация?')
  })
})

describe('isContentShortQuestion', () => {
  it('detects the sufficiency fork by kind or id', () => {
    expect(isContentShortQuestion(question({ kind: 'content_short' }))).toBe(true)
    expect(isContentShortQuestion(question({ kind: null, id: 'content_short' }))).toBe(true)
    expect(isContentShortQuestion(question({ kind: 'audience' }))).toBe(false)
  })
})

describe('normalizeContentShortOptions', () => {
  it('restores the four canonical choices in order', () => {
    const options = normalizeContentShortOptions([])
    expect(options.map((item) => item.value)).toEqual(['shrink', 'notes', 'expand_web', 'expand_model'])
    expect(options[0]?.recommended).toBe(true)
    expect(options.every((item) => item.note)).toBe(true)
  })

  it('keeps backend labels and recommendations when provided', () => {
    const options = normalizeContentShortOptions([
      option({ value: 'expand_web', label: 'Серверный лейбл', recommended: true }),
    ])
    const web = options.find((item) => item.value === 'expand_web')
    expect(web?.label).toBe('Серверный лейбл')
    expect(web?.recommended).toBe(true)
    expect(options.find((item) => item.value === 'shrink')?.recommended).toBe(false)
  })
})

describe('visibleQuestions', () => {
  it('limits the list to two questions per ADR-035', () => {
    const list = [question({ id: 'q1' }), question({ id: 'q2' }), question({ id: 'q3' })]
    const visible = visibleQuestions(list)
    expect(visible).toHaveLength(MAX_QUESTIONS_PER_TURN)
    expect(visible.map((item) => item.id)).toEqual(['q1', 'q2'])
  })

  it('sanitizes backend wording in reasons and options', () => {
    const visible = visibleQuestions([
      question({ reason: 'Ответ из знаний модели', options: [option({ label: 'Вариант от модели' })] }),
    ])
    expect(visible[0]?.reason).toBe('Ответ общими знаниями')
  })
})

describe('sanitizeQuestionCopy', () => {
  it('rewrites forbidden wording with correct endings', () => {
    expect(sanitizeQuestionCopy('Дополнено из знаний модели генерацией текста')).toBe('Дополнено общими знаниями сборкой текста')
  })
})

describe('defaultOptionValue / initialSelections', () => {
  it('picks the recommended option by default', () => {
    expect(defaultOptionValue(question())).toBe('b')
  })

  it('falls back to the first option when nothing is recommended', () => {
    const q = question({ options: [option({ value: 'x' }), option({ value: 'y' })] })
    expect(defaultOptionValue(q)).toBe('x')
  })

  it('initializes selections for each visible question', () => {
    const selections = initialSelections([question({ id: 'q1' }), question({ id: 'q2' })])
    expect(selections['q1']).toEqual({ mode: 'option', value: 'b', customText: '' })
    expect(selections['q2']).toEqual({ mode: 'option', value: 'b', customText: '' })
  })
})

describe('buildAnswersPayload', () => {
  const questions = [
    question({ id: 'key_message', kind: 'key_message' }),
    question({
      id: 'length',
      kind: 'length',
      options: [option({ value: '8', label: '8 слайдов', recommended: true })],
    }),
  ]

  it('uses default selections when the user did not touch chips', () => {
    const payload = buildAnswersPayload(questions, {}, new Set())
    expect(payload).toEqual({ key_message: 'b', length: 8 })
  })

  it('converts numeric length answers to numbers', () => {
    const selections: Record<string, QuestionSelection> = {
      length: { mode: 'option', value: '12', customText: '' },
    }
    const payload = buildAnswersPayload(questions, selections, new Set())
    expect(payload.length).toBe(12)
  })

  it('sends custom text for the custom mode', () => {
    const selections: Record<string, QuestionSelection> = {
      key_message: { mode: 'custom', value: '', customText: '  Моя мысль ' },
    }
    const payload = buildAnswersPayload(questions, selections, new Set())
    expect(payload.key_message).toBe('Моя мысль')
  })

  it('omits skipped questions entirely', () => {
    const payload = buildAnswersPayload(questions, {}, new Set(['key_message']))
    expect(payload).toEqual({ length: 8 })
  })
})

describe('cleanThesisNotes', () => {
  it('trims and drops empty thesis lines', () => {
    expect(cleanThesisNotes(['  первый ', '', '   ', 'второй'])).toEqual(['первый', 'второй'])
  })
})

describe('mapShortChoiceToFillMode', () => {
  it('maps fork choices to content fill modes', () => {
    expect(mapShortChoiceToFillMode('shrink')).toBe('keep')
    expect(mapShortChoiceToFillMode('notes')).toBe('keep')
    expect(mapShortChoiceToFillMode('expand_web')).toBe('expand')
    expect(mapShortChoiceToFillMode('expand_model')).toBe('expand')
    expect(mapShortChoiceToFillMode(undefined)).toBeNull()
  })
})

describe('normalizeAnsweredBrief', () => {
  it('merges the answered brief over the suggested one', () => {
    const brief = normalizeAnsweredBrief(
      { audience: 'совет директоров', target_slide_count: 10 },
      { audience: 'команда', tone: 'деловой', key_message: 'рост вдвое' },
      'ru',
      8,
    )
    expect(brief.audience).toBe('совет директоров')
    expect(brief.target_slide_count).toBe(10)
    expect(brief.tone).toBe('деловой')
    expect(brief.key_message).toBe('рост вдвое')
    expect(brief.language).toBe('ru')
  })

  it('clamps slide count into the supported range', () => {
    expect(normalizeAnsweredBrief({ target_slide_count: 200 }, null, 'ru', 8).target_slide_count).toBe(8)
    expect(normalizeAnsweredBrief({ target_slide_count: 0 }, null, 'ru', 8).target_slide_count).toBe(8)
  })

  it('keeps a valid content_fill passthrough', () => {
    expect(normalizeAnsweredBrief({ content_fill: 'shrink' }, null, 'ru', 8).content_fill).toBe('shrink')
    expect(normalizeAnsweredBrief({ content_fill: 'bogus' }, null, 'ru', 8).content_fill).toBeUndefined()
  })
})

describe('formatSuggestedSummary', () => {
  it('joins slide count, audience and purpose', () => {
    const summary = formatSuggestedSummary({ target_slide_count: 6, audience: 'совет директоров', purpose: 'итоги года' })
    expect(summary).toBe('Предложенный объём: 6 слайдов · Аудитория: совет директоров · Тема: итоги года')
  })

  it('returns null for empty briefs', () => {
    expect(formatSuggestedSummary({})).toBeNull()
    expect(formatSuggestedSummary(null)).toBeNull()
  })
})

describe('resolveQuestionsNote', () => {
  it('prefers the feedback note', () => {
    expect(resolveQuestionsNote(result({ assistant_note: 'сервер' }), null, null, 'Ответы учёл')).toBe('Ответы учёл')
  })

  it('explains the thesis flow when notes option is selected', () => {
    expect(resolveQuestionsNote(result(), null, 'notes', null)).toContain('тезис')
  })

  it('explains the auto-skip for an empty question list', () => {
    expect(resolveQuestionsNote(result({ questions: [] }), null, null, null)).toContain('ясны из материалов')
  })

  it('uses the backend assistant note next', () => {
    expect(resolveQuestionsNote(result({ assistant_note: '  Заметка сервера  ' }), null, null, null)).toBe('Заметка сервера')
  })

  it('falls back to the session note then a default phrase', () => {
    expect(resolveQuestionsNote(result(), 'Заметка сессии', null, null)).toBe('Заметка сессии')
    expect(resolveQuestionsNote(result(), null, null, null)).toContain('уточнений')
  })
})
