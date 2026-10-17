import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './support'

async function gotoClient(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function seedAssistantProject(page: Page): Promise<string> {
  const name = `E2E понимание ${Date.now()}`
  await openApp(page)
  await page.getByRole('button', { name: 'Новый проект' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый проект' })
  await dialog.getByRole('textbox', { name: /^Название/ }).fill(name)
  await dialog.getByRole('button', { name: 'Создать и загрузить шаблон' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/projects\/[^/]+\//)
  const projectId = /\/projects\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? ''
  const result = await page.evaluate(async (id) => {
    const form = new FormData()
    form.append('idea', 'Итоги продаж 2024–2025 для совета директоров')
    form.append('files', new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'template.pptx'))
    form.append('files', new File(['month,revenue\n2024-01,10\n2024-02,12'], 'purchases.csv', { type: 'text/csv' }))
    const response = await fetch(`/api/v1/projects/${id}/intake`, { method: 'POST', body: form })
    return response.status
  }, projectId)
  expect(result).toBe(202)
  return projectId
}

test('assistant steps 2–3: understanding review, insight confirmation, questions and plan', async ({ page }) => {
  test.setTimeout(90_000)
  const projectId = await seedAssistantProject(page)

  await test.step('step 2 shows the summary, dataset insights and semantic blocks', async () => {
    await gotoClient(page, `/projects/${projectId}/understanding`)
    await expect(page.getByRole('heading', { level: 1, name: 'Вот что я понял' })).toBeVisible()

    const summary = page.getByRole('region', { name: 'Сводка по материалам' })
    await expect(summary).toContainText('Материала примерно на')
    await expect(summary).toContainText('Главное, что я вижу')

    const datasets = page.getByRole('region', { name: 'Выводы по данным' })
    await expect(datasets).toBeVisible()
    await expect(datasets).toContainText('purchases.csv')
    await expect(datasets.getByRole('article', { name: /Вывод:/ }).first()).toContainText('Факт из данных')

    const blocks = page.getByRole('region', { name: 'Смысловые блоки' })
    await expect(blocks).toBeVisible()
    await expect(blocks.getByRole('article').first()).toBeVisible()
  })

  await test.step('insight confirmation persists through PATCH insights', async () => {
    const first = page.getByRole('article', { name: /Вывод:/ }).first()
    await first.getByRole('button', { name: 'Оставить' }).click()
    await expect(first.getByRole('button', { name: 'Оставлено' })).toBeVisible()
  })

  await test.step('removing a block updates the list and Ctrl+Z restores it', async () => {
    const blocks = page.getByRole('region', { name: 'Смысловые блоки' })
    const before = await blocks.getByRole('article').count()
    expect(before).toBeGreaterThan(0)
    await blocks.getByRole('article').first().getByRole('button', { name: /Убрать блок/ }).click()
    await expect(page.getByRole('region', { name: 'Сводка по материалам' }).getByRole('button', { name: /Отменить/ })).toBeEnabled()
    await page.keyboard.press('Control+z')
    await expect(blocks.getByRole('article')).toHaveCount(before)
  })

  await test.step('step 3 shows questions with a recommended answer and leads to the plan', async () => {
    await page.getByRole('button', { name: 'Дальше', exact: true }).last().click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/questions`))
    await expect(page.getByRole('heading', { level: 1, name: 'Пара вопросов' })).toBeVisible()

    const question = page.getByRole('region', { name: /Для кого эта презентация/ })
    await expect(question).toBeVisible()
    await expect(question).toContainText('Почему спрашиваю')
    const group = question.getByRole('radiogroup')
    await expect(group.getByRole('radio', { name: /нейтральный черновик/ })).toHaveAttribute('aria-checked', 'true')

    await group.getByRole('radio', { name: 'Совет директоров' }).click()
    await expect(group.getByRole('radio', { name: 'Совет директоров' })).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Составить план' }).last().click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/plan`), { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'План колоды' })).toBeVisible({ timeout: 30_000 })
  })
})
