import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SEEDED_PROJECT, downloadFrom, expectRenderedPreview, openApp } from './support'

async function canvasSize(preview: Locator): Promise<{ width: number; height: number }> {
  return preview.locator('canvas').evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }))
}

function auditSummary(page: Page): Locator {
  return page.getByRole('region', { name: 'Сводка аудита' })
}

test('demo path: template DNA, brief, three variants, audit repair, export', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page)

  await test.step('projects list shows the seeded project', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Проекты' })).toBeVisible()
    await page.getByRole('list', { name: 'Проекты' }).getByRole('link', { name: new RegExp(SEEDED_PROJECT) }).click()
    await expect(page.getByRole('navigation', { name: 'Шаги проекта' })).toBeVisible()
  })

  const steps = page.getByRole('navigation', { name: 'Шаги проекта' })

  await test.step('template step shows the design DNA', async () => {
    await steps.getByRole('link', { name: /Шаблон/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'ДНК шаблона' })).toBeVisible()
    const palette = page.getByRole('region', { name: 'Палитра' })
    await expect(palette.getByRole('list', { name: 'Цвета темы' }).getByRole('listitem')).not.toHaveCount(0)
    const fonts = page.getByRole('region', { name: 'Шрифты' })
    await expect(fonts).toContainText('заявлено ≠ фактически')
    await expect(fonts.getByRole('list', { name: 'Шрифты на слайдах' }).getByRole('listitem')).not.toHaveCount(0)
    const dna = await downloadFrom(page, page.getByRole('link', { name: 'ДНК в JSON' }))
    expect(dna.name).toMatch(/^design-dna-.+\.json$/)
    const parsed: unknown = JSON.parse(dna.bytes.toString('utf8'))
    expect(parsed).toEqual(expect.objectContaining({ template_id: expect.any(String) }))
  })

  await test.step('brief: purpose «Продукт» and start generation', async () => {
    await page.getByRole('button', { name: /Дальше: бриф/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'О чём презентация' })).toBeVisible()
    const product = page.getByRole('radiogroup', { name: 'Назначение' }).getByRole('radio', { name: /^Продукт/ })
    await product.check()
    await expect(product).toBeChecked()
    await page.getByRole('button', { name: /Собрать 3 варианта/ }).click()
  })

  await test.step('generation page counts time against 5:00 and finishes with three variants', async () => {
    const budget = page.getByRole('region', { name: 'Время генерации против бюджета' })
    await expect(budget).toBeVisible()
    await expect(budget).toContainText('5:00')
    await expect(budget.getByRole('timer')).toHaveText(/^\d+:\d{2}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Три варианта готовы' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('article').filter({ hasText: 'Готово' })).toHaveCount(3)
  })

  await test.step('variants page renders PDF thumbnails', async () => {
    await page.getByRole('link', { name: /Сравнить варианты/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Один контент, один шаблон, три стратегии' })).toBeVisible()
    for (const strategy of ['Близко к шаблону', 'Сбалансированный', 'Визуальный']) {
      const slides = page.getByRole('list', { name: `Слайды варианта «${strategy}»` })
      const first = slides.getByRole('img').first()
      await expectRenderedPreview(first)
      const size = await canvasSize(first)
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })

  await test.step('audit: fix two auto-fixable issues and see them in the journal', async () => {
    await page.getByRole('region', { name: 'Сбалансированный' }).getByRole('link', { name: 'Открыть и проверить' }).click()
    await expect(auditSummary(page)).toBeVisible()
    const panel = page.getByRole('complementary', { name: 'Проблемы' })
    const selectable = panel.getByRole('checkbox', { name: /^Выбрать для исправления/ })
    await expect(selectable.first()).toBeVisible()
    await selectable.nth(0).check()
    await selectable.nth(1).check()
    const repair = page.getByRole('button', { name: 'Исправить выбранное (2)' })
    await expect(repair).toBeEnabled()
    await repair.click()
    const journalTab = panel.getByRole('tab', { name: /^Журнал · [1-9]/ })
    await expect(journalTab).toBeVisible({ timeout: 20_000 })
    await journalTab.click()
    await expect(panel.getByRole('list', { name: 'Ревизии' })).toContainText('исправлено 2')
    const entries = panel.getByRole('list', { name: 'Журнал изменений' }).getByRole('listitem')
    await expect(entries).toHaveCount(2)
    await expect(entries.locator('[data-outcome="fixed"]')).toHaveCount(2)
  })

  await test.step('export: PPTX downloads, open errors are flagged, HTML is honestly not implemented', async () => {
    await auditSummary(page).getByRole('link', { name: /Экспорт/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Редактируемый PPTX в стиле шаблона' })).toBeVisible()
    const files = page.getByRole('region', { name: 'Файлы' })
    const pptx = files.getByRole('article', { name: /\.pptx$/ })
    const downloadLink = pptx.getByRole('link', { name: /^Скачать/ }).first()
    await expect(downloadLink).toBeVisible({ timeout: 20_000 })
    const deck = await downloadFrom(page, downloadLink)
    expect(deck.name).toMatch(/\.pptx$/)
    expect(deck.bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(deck.bytes.length).toBeGreaterThan(1024)
    const html = files.getByRole('article', { name: /_html\.zip$/ })
    await expect(html).toContainText('Не реализовано сервисом')
    await expect(html.getByRole('button')).toHaveCount(0)
    await expect(files.getByRole('status').filter({ hasText: /^Открыт/ })).toBeVisible()
    await expect(files.getByRole('link', { name: 'К аудиту' })).toBeVisible()
  })
})
