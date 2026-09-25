export type RuleCategory = 'brand' | 'layout' | 'text' | 'density' | 'integrity' | 'meaning'

export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  brand: 'Шаблон и бренд',
  layout: 'Вёрстка',
  text: 'Текст и читаемость',
  density: 'Плотность',
  integrity: 'Целостность и редактируемость',
  meaning: 'Смысл (модель)',
}

export const CATEGORY_ORDER: readonly RuleCategory[] = ['brand', 'layout', 'text', 'density', 'integrity', 'meaning']

interface RuleMeta {
  name: string
  category: RuleCategory
  autoFix?: string
}

export const RULES: Record<string, RuleMeta> = {
  'layout.out_of_bounds': { name: 'Элемент выходит за границы слайда', category: 'layout', autoFix: 'Вернуть фигуру в границы слайда' },
  'layout.unintended_overlap': { name: 'Блоки накладываются друг на друга', category: 'layout' },
  'layout.edge_margin': { name: 'Контент заходит в поля у края', category: 'layout', autoFix: 'Сдвинуть блок в поля шаблона' },
  'image.aspect_ratio': { name: 'Картинка растянута', category: 'layout', autoFix: 'Восстановить пропорции картинки' },
  'text.overflow': { name: 'Текст не помещается в рамку', category: 'text', autoFix: 'Сократить текст или увеличить рамку' },
  'text.slide_clip': { name: 'Текст обрезан краем слайда', category: 'text', autoFix: 'Сдвинуть текст внутрь слайда' },
  'text.font_floor': { name: 'Слишком мелкий кегль', category: 'text' },
  'accessibility.contrast': { name: 'Контраст текста ниже 4.5:1', category: 'text', autoFix: 'Заменить цвет текста на контрастный из палитры' },
  'template.font_family': { name: 'Шрифт не из шаблона', category: 'brand', autoFix: 'Заменить шрифт на шрифт шаблона' },
  'template.font_scale': { name: 'Кегль не из шкалы шаблона', category: 'brand' },
  'template.color_palette': { name: 'Цвет не из палитры шаблона', category: 'brand', autoFix: 'Заменить на ближайший цвет палитры' },
  'template.anchor_position': { name: 'Логотип или колонтитул сдвинут', category: 'brand', autoFix: 'Вернуть элемент в якорь шаблона' },
  'template.layout_origin': { name: 'Слайд собран не на макете шаблона', category: 'brand' },
  'density.bullet_count': { name: 'Больше 6 буллетов на слайде', category: 'density' },
  'density.bullet_length': { name: 'Буллет длиннее 15 слов', category: 'density' },
  'density.table_size': { name: 'Таблица больше 7 × 5', category: 'density' },
  'density.chart_series': { name: 'Больше 5 серий на диаграмме', category: 'density' },
  'density.occupancy': { name: 'Слайд заполнен меньше ¼ или больше ¾', category: 'density' },
  'integrity.empty_slide': { name: 'Пустой слайд или только заголовок', category: 'integrity', autoFix: 'Объединить с соседним слайдом' },
  'integrity.duplicate_slide': { name: 'Слайды дублируют друг друга', category: 'integrity', autoFix: 'Убрать дубль' },
  'integrity.placeholder_text': { name: 'Остался текст-заглушка', category: 'integrity', autoFix: 'Убрать пустой плейсхолдер' },
  'integrity.package': { name: 'Файл повреждён', category: 'integrity' },
  'editability.raster_only': { name: 'Слайд — картинка, а не объекты', category: 'integrity', autoFix: 'Пересобрать слайд нативными объектами' },
  'chart.metadata': { name: 'У диаграммы нет подписей или легенды', category: 'integrity' },
  'content.conclusion_title': { name: 'Заголовок называет тему, а не вывод', category: 'meaning' },
  'content.title_alignment': { name: 'Содержимое не соответствует заголовку', category: 'meaning' },
  'content.single_message': { name: 'Слайд не пересказывается одной фразой', category: 'meaning' },
  'content.source_support': { name: 'Факт не найден в исходных материалах', category: 'meaning' },
  'content.nonempty': { name: 'На слайде только заголовок', category: 'meaning' },
  'content.visual_relevance': { name: 'Картинки не по теме слайда', category: 'meaning' },
  'content.prompt_leakage': { name: 'Служебный мусор на слайде', category: 'meaning' },
  'content.spelling': { name: 'Опечатки', category: 'meaning' },
  'content.data_relevance': { name: 'Данные не работают на мысль слайда', category: 'meaning' },
  'deck.logical_flow': { name: 'Соседние слайды не связаны', category: 'meaning' },
}

export function ruleMeta(ruleCode: string): RuleMeta {
  return RULES[ruleCode] ?? { name: ruleCode, category: ruleCode.startsWith('content.') || ruleCode.startsWith('deck.') ? 'meaning' : 'integrity' }
}

export function isAutoFixable(ruleCode: string): boolean {
  return Boolean(RULES[ruleCode]?.autoFix)
}
