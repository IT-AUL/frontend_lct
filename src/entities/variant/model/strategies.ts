import type { CatalogStrategy, VariantSummary } from './types'

export type ProfileLevel = 1 | 2 | 3

export interface StrategyProfile {
  exemplarLayouts: ProfileLevel
  text: ProfileLevel
  visuals: ProfileLevel
}

export interface StrategyInfo {
  id: string
  name: string
  axis: string
  audience: string
  rationale: string
  profile: StrategyProfile | null
  recommended: boolean
}

export const STRATEGY_ORDER: readonly CatalogStrategy[] = ['faithful', 'balanced', 'visual']

export const DEFAULT_STRATEGY: CatalogStrategy = 'balanced'

export const STRATEGY_AXIS =
  'Все три варианта собраны из одного контента по одним правилам шаблона: только его шрифты, цвета и макеты. Различаются они соотношением текста и визуализации и тем, насколько близко слайды повторяют макеты-образцы шаблона.'

export const STRATEGY_PROFILE_LABEL: Record<keyof StrategyProfile, string> = {
  exemplarLayouts: 'Макеты-образцы',
  text: 'Текст',
  visuals: 'Визуализация',
}

export const STRATEGIES: Record<CatalogStrategy, StrategyInfo> = {
  faithful: {
    id: 'faithful',
    name: 'Близко к шаблону',
    axis: 'Макеты-образцы шаблона, больше текста на слайде, без слайда повестки.',
    audience: 'Когда колода должна выглядеть как «родная» в библиотеке компании.',
    rationale: 'Контент раскладывается по макетам, которые ближе всего к образцам шаблона. Колода выглядит предсказуемо и узнаваемо, но визуализации в ней меньше.',
    profile: { exemplarLayouts: 3, text: 3, visuals: 1 },
    recommended: false,
  },
  balanced: {
    id: 'balanced',
    name: 'Сбалансированный',
    axis: 'Разнообразие макетов и умеренная визуализация. Вариант по умолчанию.',
    audience: 'Для большинства выступлений: история читается, слайды не однообразны.',
    rationale: 'Середина оси: макеты шаблона чередуются, текст и визуальные элементы в равновесии. Поэтому этот вариант мы предлагаем по умолчанию.',
    profile: { exemplarLayouts: 2, text: 2, visuals: 2 },
    recommended: true,
  },
  visual: {
    id: 'visual',
    name: 'Визуальный',
    axis: 'Упор на графики и визуализацию данных, меньше текста.',
    audience: 'Когда решение принимают по цифрам и важно, чтобы данные бросались в глаза.',
    rationale: 'Числа из контента становятся нативными графиками, таблицами и схемами, текст сокращается. Правила шаблона те же, что у остальных вариантов.',
    profile: { exemplarLayouts: 1, text: 1, visuals: 3 },
    recommended: false,
  },
}

function isCatalogStrategy(strategy: string): strategy is CatalogStrategy {
  return strategy in STRATEGIES
}

export function strategyInfo(strategy: string): StrategyInfo {
  if (isCatalogStrategy(strategy)) return STRATEGIES[strategy]
  return {
    id: strategy,
    name: strategy === 'custom' ? 'Своя стратегия' : strategy,
    axis: 'Стратегия задана вручную.',
    audience: 'Для особых случаев, когда стандартных стратегий недостаточно.',
    rationale: 'Параметры стратегии задал пользователь.',
    profile: null,
    recommended: false,
  }
}

export function variantRationale(variant: Pick<VariantSummary, 'strategy' | 'rationale'>): string {
  return variant.rationale?.trim() || strategyInfo(variant.strategy).rationale
}

export function orderVariants<T extends Pick<VariantSummary, 'strategy'>>(variants: readonly T[]): T[] {
  const rank = (strategy: string) => {
    const position = STRATEGY_ORDER.findIndex((known) => known === strategy)
    return position === -1 ? STRATEGY_ORDER.length : position
  }
  return [...variants].sort((a, b) => rank(a.strategy) - rank(b.strategy))
}
