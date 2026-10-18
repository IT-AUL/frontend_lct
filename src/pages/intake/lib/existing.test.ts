import { describe, expect, it } from 'vitest'
import { existingFiles, topicFromBrief, withoutColorCodes } from './existing'

describe('topicFromBrief', () => {
  it('keeps a written topic and drops a bare purpose code', () => {
    expect(topicFromBrief({ purpose: 'показать рост клиентов по кварталам' })).toBe('показать рост клиентов по кварталам')
    expect(topicFromBrief({ purpose: 'presentation' })).toBe('')
    expect(topicFromBrief(undefined)).toBe('')
  })
})

describe('existingFiles', () => {
  it('lists the template, datasets and brandbook already in the project', () => {
    expect(existingFiles({ template: 'vk.pptx', brandbook: 'Северный ветер', datasets: [{ title: 'Продажи' }], sections: 2 })).toEqual([
      { name: 'vk.pptx', kind: 'template' },
      { name: 'Продажи', kind: 'data' },
      { name: 'Северный ветер', kind: 'brandbook' },
    ])
  })

  it('names plain text materials when there is no table', () => {
    expect(existingFiles({ template: null, brandbook: null, datasets: [], sections: 3 })).toEqual([{ name: 'Текст материалов', kind: 'content' }])
  })
})

describe('withoutColorCodes', () => {
  it('drops raw colour codes from the assistant note', () => {
    expect(withoutColorCodes('Шаблон: 54 слайда, главный цвет #0077FF, шрифт Arial.')).toBe('Шаблон: 54 слайда, шрифт Arial.')
    expect(withoutColorCodes('Акцент #E4572E совпадает')).toBe('Акцент совпадает')
  })
})
