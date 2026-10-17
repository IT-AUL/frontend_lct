import { expect, test } from '@playwright/test'
import { downloadFrom, openApp, SEEDED_PROJECT } from './support'

test('polish step: audit repair, slide rework, style switch, passport and downloads', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page)

  await test.step('a finished project opens straight on the polish step', async () => {
    await page.getByRole('list', { name: 'Проекты' }).getByRole('link', { name: new RegExp(SEEDED_PROJECT) }).click()
    await expect(page).toHaveURL(/\/polish\//, { timeout: 20_000 })
    await expect(page.getByRole('region', { name: 'Сводка аудита' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('combobox', { name: 'Вариант · ревизия' })).toHaveValue(/var_/)
  })

  await test.step('two auto-fixable issues are fixed and land in the journal', async () => {
    const panel = page.getByRole('complementary', { name: 'Проблемы' })
    await expect(panel.getByText('108 находок')).toBeVisible()
    const overflow = panel.getByRole('region', { name: 'Текст не помещается в рамку' })
    await overflow.getByRole('button', { name: /Текст не помещается в рамку/, expanded: false }).click()
    const selectable = overflow.getByRole('checkbox', { name: /^Выбрать для исправления/ })
    await selectable.nth(0).check()
    await selectable.nth(1).check()
    await page.getByRole('button', { name: 'Исправить выбранное (2)' }).click()
    const journalTab = panel.getByRole('tab', { name: /^Журнал · [1-9]/ })
    await expect(journalTab).toBeVisible({ timeout: 20_000 })
    await journalTab.click()
    await expect(panel.getByRole('list', { name: 'Ревизии' })).toContainText('исправлено 2')
  })

  await test.step('the slide tab reworks only the current slide and explains it', async () => {
    const panel = page.getByRole('complementary', { name: 'Проблемы' })
    await panel.getByRole('tab', { name: 'Слайд' }).click()
    await expect(panel.getByRole('heading', { name: /^Переделать слайд \d+$/ })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Почему так' })).toBeVisible()
    await panel.getByRole('button', { name: 'Короче' }).click()
    await expect(panel.getByText('Сделал слайд короче.')).toBeVisible({ timeout: 20_000 })
  })

  await test.step('switching the style keeps the user on the polish step', async () => {
    const select = page.getByRole('combobox', { name: 'Вариант · ревизия' })
    const current = await select.inputValue()
    const other = await select.locator('option').evaluateAll((options, value) => options.map((option) => (option as HTMLOptionElement).value).find((id) => id !== value), current)
    await select.selectOption(other ?? current)
    await expect(page).toHaveURL(new RegExp(`/polish/${other}`))
  })

  await test.step('the passport opens and the PPTX downloads', async () => {
    const downloads = page.getByRole('group', { name: 'Скачать презентацию' })
    await downloads.getByRole('button', { name: 'Паспорт качества' }).click()
    const drawer = page.getByRole('dialog', { name: 'Паспорт качества' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('region', { name: 'Контрольные суммы файлов' })).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')

    const link = downloads.getByRole('link', { name: 'Скачать PPTX' })
    await expect(link).toBeVisible({ timeout: 20_000 })
    const deck = await downloadFrom(page, link)
    expect(deck.name).toMatch(/\.pptx$/)
    expect(deck.bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})
