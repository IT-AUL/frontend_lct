import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openApp } from './support'

const PROJECT_ID = 'prj_d7a5e61be4be4491b158c5f93699a38d'
const PACK_ID = 'pack-7aa41ae9'
const TEMPLATE_ID = 'tpl_4497762842c84a478245dcfb47552046'
const KEY_MESSAGE = 'Выручка выросла в 2,1 раза за счёт Москвы и корпоративного сегмента'

interface FixtureBody {
  plan_id: string
  plans: {
    deck_plan: {
      brief: { key_message?: string | null }
      slides: { id: string; supports_key_message?: boolean | null }[]
    }
  }[]
}

const planFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/shared/api/mocks/fixtures/assistant/data-plan.json', import.meta.url)), 'utf8'),
).body as FixtureBody

function seedPlanRequest() {
  const first = planFixture.plans[0]
  if (!first) throw new Error('plan fixture has no plans')
  const deckPlan = structuredClone(first.deck_plan)
  deckPlan.brief.key_message = KEY_MESSAGE
  deckPlan.slides = deckPlan.slides.map((slide: { id: string }) => (slide.id === 'slide-6' ? { ...slide, supports_key_message: false } : slide))
  return {
    request: {
      template_id: TEMPLATE_ID,
      content_pack_id: PACK_ID,
      brief: deckPlan.brief,
      strategies: ['balanced'],
      use_llm: false,
    },
    result: {
      planId: planFixture.plan_id,
      proposals: [{ strategy: 'balanced', deckPlan }],
      sufficiency: null,
      research: null,
    },
    keyMessage: KEY_MESSAGE,
    createdAt: new Date().toISOString(),
  }
}

async function openPlan(page: Page) {
  const seed = JSON.stringify(seedPlanRequest())
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [`deckdna.plan-request.v1:${PROJECT_ID}`, seed],
  )
  await openApp(page, `/projects/${PROJECT_ID}/plan`)
  await expect(page.getByRole('heading', { level: 1, name: 'План колоды' })).toBeVisible({ timeout: 30_000 })
}

test.describe('plan step', () => {
  test('edits the key message and keeps it in the banner', async ({ page }) => {
    await openPlan(page)

    const banner = page.getByRole('region', { name: 'Главная мысль колоды' })
    await expect(banner).toContainText(KEY_MESSAGE)
    await banner.getByRole('button', { name: 'Изменить мысль' }).click()
    const input = banner.getByRole('textbox', { name: 'Текст главной мысли колоды' })
    await input.fill('Электроника даёт 61% выручки')
    await input.press('Enter')
    await expect(banner).toContainText('Электроника даёт 61% выручки')
    await expect(banner.getByRole('textbox')).toHaveCount(0)
  })

  test('explains the chart and switches its type with an optimistic chip', async ({ page }) => {
    await openPlan(page)

    const box = page.locator('div[aria-label="Почему такой график на слайде 03"]')
    await expect(box).toContainText('Почему такой график')
    await expect(box).toContainText('24 точки по месяцам')
    const chips = box.getByRole('group', { name: 'Альтернативы графика слайда 03' })
    await expect(chips.getByRole('button', { name: '● Линия' })).toHaveAttribute('aria-pressed', 'true')

    const patched = page.waitForResponse((response) => response.url().includes('/slides/slide-2') && response.request().method() === 'PATCH')
    await chips.getByRole('button', { name: 'Столбцы' }).click()
    await patched
    await expect(chips.getByRole('button', { name: '● Столбцы' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows hover quick actions and splits a slide', async ({ page }) => {
    await openPlan(page)

    const row = page.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'Заголовок слайда 02' }) })
    await row.hover()
    const toolbar = row.getByRole('toolbar', { name: 'Быстрые действия со слайдом 02' })
    await expect(toolbar.getByRole('button', { name: 'Короче слайд 02' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Разбить на два слайд 02' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Объединить со следующим слайд 02' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Сделать графиком слайд 02' })).toBeVisible()

    const acted = page.waitForResponse((response) => response.url().includes('/slides/slide-1/actions'))
    await toolbar.getByRole('button', { name: 'Разбить на два слайд 02' }).click()
    await acted
    await expect(page.getByRole('textbox', { name: 'Заголовок слайда 03' })).toHaveValue(/продолжение/)
  })

  test('dims an off-topic slide and keeps it on request', async ({ page }) => {
    await openPlan(page)

    const hint = page.getByRole('note').filter({ hasText: 'Не про главную мысль — убрать?' })
    await expect(hint).toBeVisible()
    await expect(page.locator('li[data-off-topic="true"]')).toHaveCount(1)
    await expect(page.locator('p[aria-label="Строка помощника"]')).toContainText('главной мысли')

    await hint.getByRole('button', { name: 'Оставить' }).click()
    await expect(page.locator('li[data-off-topic="true"]')).toHaveCount(0)
  })

  test('leads to the style step and offers the autopilot escape', async ({ page }) => {
    await openPlan(page)

    await expect(page.getByRole('button', { name: 'Сделай сам' })).toBeEnabled()
    await Promise.all([
      page.waitForURL(new RegExp(`/projects/${PROJECT_ID}/style`)),
      page.getByRole('button', { name: 'Выбрать стиль' }).click(),
    ])

    await page.goto(`/projects/${PROJECT_ID}/plan`)
    await expect(page.getByRole('heading', { level: 1, name: 'План колоды' })).toBeVisible()
    await page.getByRole('button', { name: 'Сделай сам' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_ID}/runs/run_`), { timeout: 20_000 })
  })
})
