import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './support'

const TEMPLATE = fileURLToPath(new URL('./fixtures/minimal-template.pptx', import.meta.url))
const TEMPLATE_PAYLOAD = { name: 'minimal-template.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: readFileSync(TEMPLATE) }

async function createProject(page: Page): Promise<void> {
  await openApp(page)
  await page.getByRole('button', { name: 'Новый проект' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый проект' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: /^Название/ }).fill(`E2E приём ${Date.now()}`)
  await dialog.getByRole('button', { name: 'Создать и закинуть файлы' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/projects\/[^/]+\/start$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Закинь, что есть' })).toBeVisible()
}

test('assistant step 1: upload files, review roles and cards, go next', async ({ page }) => {
  await createProject(page)

  const next = page.getByRole('button', { name: 'Дальше' })
  await expect(next).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Сделай сам' })).toBeDisabled()

  await page.getByRole('textbox', { name: /Идея одной фразой/ }).fill('Итоги продаж за два года для совета директоров')

  const dropzone = page.getByRole('button', { name: /Перетащите файлы сюда/ })
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dropzone.click()])
  await chooser.setFiles([
    TEMPLATE_PAYLOAD,
    { name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from('month,sales\n1,10\n') },
    { name: 'brand_tokens.json', mimeType: 'application/json', buffer: Buffer.from('{"color":{"primary":"#E4572E"}}') },
    { name: 'raw_scan.tiff', mimeType: 'image/tiff', buffer: Buffer.from('II') },
  ])

  const list = page.getByRole('list', { name: 'Загруженные файлы' })
  await expect(list).toContainText('minimal-template.pptx')
  await expect(list).toContainText('sales.csv')
  await expect(list).toContainText('brand_tokens.json')
  await expect(list.getByRole('alert')).toContainText('не поддерживается')

  const role = page.getByRole('combobox', { name: 'Роль файла sales.csv' })
  await expect(role).toHaveValue('data')
  await role.selectOption('brandbook')
  await expect(role).toHaveValue('brandbook')

  await page.getByRole('button', { name: 'Убрать raw_scan.tiff' }).click()
  await expect(list).not.toContainText('raw_scan.tiff')
  await expect(list).toContainText('sales.csv')

  await expect(page.getByText('Принял: шаблон, данные.')).toBeVisible()

  const templateCard = page.getByRole('region', { name: /VK Tech шаблон/ }).or(page.locator('section').filter({ hasText: 'ДНК извлечена' }))
  await expect(templateCard).toContainText('54 слайда')
  await expect(templateCard).toContainText('Обложки: 2')
  await expect(templateCard).toContainText('Рабочие: 47')
  await expect(templateCard).toContainText('#0077FF')

  const brandbookCard = page.locator('section').filter({ hasText: 'Северный ветер' })
  await expect(brandbookCard).toContainText('Расхождения с шаблоном')
  const priority = brandbookCard.getByRole('radiogroup', { name: 'Приоритет оформления' })
  await expect(priority.getByRole('radio', { name: 'Брендбук' })).toHaveAttribute('aria-checked', 'true')
  await priority.getByRole('radio', { name: 'Шаблон' }).click()
  await expect(priority.getByRole('radio', { name: 'Шаблон' })).toHaveAttribute('aria-checked', 'true')

  await templateCard.getByRole('button', { name: /Все детали ДНК/ }).click()
  const drawer = page.getByRole('dialog', { name: 'ДНК шаблона' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText(/Палитра|Шрифты/).first()).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()

  await expect(next).toBeEnabled()
  await next.click()
  await expect(page).toHaveURL(/\/brief$/)
})

test('assistant step 1: template only still needs material or idea', async ({ page }) => {
  await createProject(page)

  const dropzone = page.getByRole('button', { name: /Перетащите файлы сюда/ })
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), dropzone.click()])
  await chooser.setFiles([TEMPLATE])

  const list = page.getByRole('list', { name: 'Загруженные файлы' })
  await expect(list).toContainText('minimal-template.pptx')
  await expect(page.getByRole('button', { name: 'Дальше' })).toBeDisabled()
  await expect(page.getByText(/нужны шаблон и хотя бы один материал или идея/)).toBeVisible()

  await page.getByRole('textbox', { name: /Идея одной фразой/ }).fill('Питч нового продукта для инвесторов')
  await expect(page.getByRole('button', { name: 'Дальше' })).toBeEnabled()
})
