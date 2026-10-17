import { expect, test } from '@playwright/test'
import { downloadFrom, openApp } from './support'

const PROJECT_ID = 'prj_d7a5e61be4be4491b158c5f93699a38d'
const RUN_ID = 'run_912f80e845264f1daf244744ffbc364f'
const BALANCED_ID = 'var_b378e6a40bb449deac6e62029c46fe1a'
const VISUAL_ID = 'var_9984ba5c9e8c47a69c018edf2f12eadb'
const POLISH_URL = `/projects/${PROJECT_ID}/runs/${RUN_ID}/polish`

test('polish step: slide rework, audit repair, explain, notes, passport and export', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page)

  await test.step('opens the polish workspace on the default balanced variant', async () => {
    await page.goto(POLISH_URL)
    await expect(page).toHaveURL(new RegExp(`/polish/${BALANCED_ID}`))

    const variants = page.getByRole('radiogroup', { name: 'Вариант колоды' })
    await expect(variants).toBeVisible()
    await expect(variants.getByRole('radio', { name: 'Сбалансированный' })).toBeChecked()

    await expect(page.getByRole('navigation', { name: 'Слайды' }).getByRole('button')).toHaveCount(12)
    await expect(page.getByRole('region', { name: 'Переделать слайд' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Почему так' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Что можно улучшить' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Заметки докладчика и источники' })).toBeVisible()

    const downloads = page.getByRole('group', { name: 'Скачать презентацию' })
    await expect(downloads.getByRole('link', { name: 'Скачать PPTX' })).toBeVisible({ timeout: 20_000 })
    await expect(downloads.getByRole('link', { name: 'PDF' })).toBeVisible()
    await expect(downloads.getByRole('button', { name: 'HTML' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Паспорт качества' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Подробный аудит/ })).toBeVisible()
  })

  await test.step('switches variants from the toolbar', async () => {
    await page.getByRole('radiogroup', { name: 'Вариант колоды' }).getByRole('radio', { name: 'Визуальный' }).click()
    await expect(page).toHaveURL(new RegExp(`/polish/${VISUAL_ID}`))
    await page.getByRole('radiogroup', { name: 'Вариант колоды' }).getByRole('radio', { name: 'Сбалансированный' }).click()
    await expect(page).toHaveURL(new RegExp(`/polish/${BALANCED_ID}`))
  })

  await test.step('shows slide issues in human language and repairs them', async () => {
    await page.getByRole('navigation', { name: 'Слайды' }).getByRole('button', { name: /^Слайд 3:/ }).click()
    await expect(page).toHaveURL(/slide=3/)

    const audit = page.getByRole('region', { name: 'Что можно улучшить' })
    await expect(audit.getByRole('button', { name: /Слайд 03 · 18/ })).toBeVisible()

    const repair = audit.getByRole('button', { name: /^Исправить на слайде \([1-9]\d*\)/ })
    await expect(repair).toBeVisible({ timeout: 20_000 })
    await repair.click()
    await expect(audit.getByRole('button', { name: /Журнал · [1-9]/ })).toBeVisible({ timeout: 30_000 })
  })

  await test.step('regenerates only the current slide and refreshes its preview', async () => {
    const rework = page.getByRole('region', { name: 'Переделать слайд' })
    await rework.getByRole('button', { name: 'Короче' }).click()
    await expect(rework.getByText('Образец шаблона: слайд #24')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Сделал слайд короче.').first()).toBeVisible()
  })

  await test.step('explains the slide composition and shows speaker notes', async () => {
    const explain = page.getByRole('region', { name: 'Почему так' })
    await expect(explain.getByText('Назначение')).toBeVisible()

    await page.getByRole('navigation', { name: 'Слайды' }).getByRole('button', { name: /^Слайд 2:/ }).click()
    const notes = page.getByRole('region', { name: 'Заметки докладчика и источники' })
    await expect(notes).toContainText('Сводка слайдов секций')
    await expect(notes.getByRole('button', { name: /Скопировать заметки/ })).toBeVisible()
  })

  await test.step('opens the quality passport and downloads PPTX', async () => {
    await page.getByRole('button', { name: 'Паспорт качества' }).click()
    const drawer = page.getByRole('dialog', { name: 'Паспорт качества' })
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')

    const pptx = await downloadFrom(page, page.getByRole('group', { name: 'Скачать презентацию' }).getByRole('link', { name: 'Скачать PPTX' }))
    expect(pptx.name).toMatch(/\.pptx$/)
    expect(pptx.bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  await test.step('keeps the detailed audit page reachable', async () => {
    await page.getByRole('link', { name: /Подробный аудит/ }).click()
    await expect(page).toHaveURL(/\/audit\//)
    await expect(page.getByRole('region', { name: 'Сводка аудита' })).toBeVisible({ timeout: 20_000 })
  })
})
