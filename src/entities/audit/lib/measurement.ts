import type { AuditIssue } from '../model/types'
import { formatMeasurement } from './issues'

interface RuleUnit {
  measured: (value: number) => string
  threshold: (value: number) => string
}

const plain = (value: number) => formatMeasurement(value)
const percent = (value: number) => `${formatMeasurement(Math.round(value * 1000) / 10)}%`

const RULE_UNITS: Record<string, RuleUnit> = {
  'accessibility.contrast': { measured: (value) => `${plain(value)}:1`, threshold: (value) => `≥ ${plain(value)}:1` },
  'text.font_floor': { measured: (value) => `${plain(value)} pt`, threshold: (value) => `≥ ${plain(value)} pt` },
  'template.color_palette': { measured: (value) => `ΔE ${plain(value)}`, threshold: (value) => `ΔE ≤ ${plain(value)}` },
  'template.font_scale': { measured: percent, threshold: (value) => `≤ ${percent(value)}` },
}

export interface MeasurementView {
  measured: string
  threshold: string
  hasValue: boolean
}

export function describeMeasurement(issue: Pick<AuditIssue, 'rule_code' | 'measured_value' | 'threshold'>): MeasurementView {
  const unit = RULE_UNITS[issue.rule_code]
  const render = (value: AuditIssue['threshold'], withUnit: ((value: number) => string) | undefined) =>
    typeof value === 'number' && withUnit ? withUnit(value) : formatMeasurement(value)
  return {
    measured: render(issue.measured_value, unit?.measured),
    threshold: render(issue.threshold, unit?.threshold),
    hasValue: issue.measured_value !== null && issue.measured_value !== undefined,
  }
}

const ACTION_LABEL: Record<string, string> = {
  map_font: 'подобрать кегль и шрифт из шаблона',
  reflow: 'перераспределить текст',
  shorten_text: 'сократить текст',
  split_text: 'разбить текст',
  resize_shape: 'увеличить рамку',
  map_color: 'заменить цвет на контрастный из палитры',
  recolor: 'перекрасить в цвет палитры',
  palette_substitution: 'заменить на ближайший цвет палитры',
  recrop_image: 'перекадрировать картинку',
  contain_image: 'вписать картинку без искажений',
  rewrite_title: 'переписать заголовок как вывод',
  rewrite_text: 'сократить текст моделью',
  move_shape: 'сдвинуть фигуру',
  crop_image: 'кадрировать картинку',
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}
