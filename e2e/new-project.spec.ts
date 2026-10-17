import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { downloadFrom, openApp, SEEDED_PROJECT } from './support'

const TEMPLATE = fileURLToPath(new URL('./fixtures/minimal-template.pptx', import.meta.url))

test('new project: create lands on intake and accepts a template', async ({ page }) => {
  const name = `E2E проект ${Date.now()}`
  await openApp(page)

  await page.getByRole('button', { name: 'Новый проект' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый проект' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: /^Название/ }).fill(name)
  await dialog.getByRole('button', { name: 'Создать и закинуть файлы' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/projects\/[^/]+\/start$/)
  await expect(page.getByRole('navigation', { name: 'Навигация' })).toContainText(name)

  const dropzone = page.getByRole('button', { name: /Перетащите файлы сюда/ })
  await expect(dropzone).toBeVisible()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dropzone.click()])
  await chooser.setFiles(TEMPLATE)

  const list = page.getByRole('list', { name: 'Загруженные файлы' })
  await expect(list).toContainText('minimal-template.pptx')
  await expect(page.getByRole('combobox', { name: 'Роль файла minimal-template.pptx' })).toHaveValue('template')
})

test('template page: seeded project shows the analysis', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('list', { name: 'Проекты' }).getByRole('link', { name: new RegExp(SEEDED_PROJECT) })).toBeVisible()
  await page.getByRole('button', { name: /Демо/ }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'ДНК шаблона' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Что система поняла' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('region', { name: 'Палитра' }).getByRole('list', { name: 'Цвета темы' }).getByRole('listitem')).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: /Дальше: бриф/ })).toBeEnabled()
  const dna = await downloadFrom(page, page.getByRole('link', { name: 'ДНК в JSON' }))
  expect(dna.name).toMatch(/^design-dna-.+\.json$/)
  const parsed: unknown = JSON.parse(dna.bytes.toString('utf8'))
  expect(parsed).toEqual(expect.objectContaining({ template_id: expect.any(String) }))

  await page.getByRole('banner').getByRole('link', { name: 'DeckDNA — к проектам' }).click()
  await expect(page.getByRole('list', { name: 'Проекты' }).getByRole('link', { name: new RegExp(SEEDED_PROJECT) })).toBeVisible()
})
