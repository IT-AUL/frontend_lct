import { chromium } from 'playwright'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:4623'
const OUT = process.env.SHOTS_OUT ?? '/home/renat-ubuntu/dev/frontend_lct/.claude/orchestra/reports/LEAD-FE-shots'
const SEEDED_PROJECT = 'Защита продукта DeckDNA'

const themes = ['light', 'dark']

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`saved ${name}`)
}

const browser = await chromium.launch()

for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript((value) => window.localStorage.setItem('deckdna.theme.v1', JSON.stringify(value)), theme)
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[console:${theme}]`, msg.text())
  })

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await shoot(page, `01-projects-${theme}`)

  await page.getByRole('button', { name: 'Выручка и каналы' }).click()
  await page.getByRole('list', { name: 'Прикреплённые файлы' }).getByText('neutral-template.pptx').waitFor({ timeout: 5000 })
  await shoot(page, `02-home-preset-neutral-${theme}`)

  await page.getByRole('button', { name: 'Начать' }).click()
  await page.waitForURL('**/projects/*/start')
  await page.getByText('neutral-template.pptx').waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
  await shoot(page, `03-step1-preset-${theme}`)

  await page.getByRole('button', { name: 'Дальше', exact: true }).click()
  await page.waitForURL('**/understanding', { timeout: 30000 })
  await page.getByRole('heading', { level: 1, name: 'Вот что я нашёл' }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await shoot(page, `04-step2-understanding-${theme}`)

  await page.getByRole('button', { name: 'Дальше', exact: true }).click()
  await page.waitForURL('**/questions', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await shoot(page, `05-step3-questions-${theme}`)

  await page.getByRole('button', { name: 'Составить план', exact: true }).click()
  await page.waitForURL('**/plan', { timeout: 60000 })
  await page.getByRole('heading', { level: 1, name: 'План презентации' }).waitFor({ timeout: 60000 })
  await page.waitForTimeout(1200)
  await shoot(page, `06-step4-plan-${theme}`)

  await page.getByRole('button', { name: 'Выбрать стиль' }).click()
  await page.waitForURL('**/style', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await shoot(page, `07-step5-style-${theme}`)

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.getByRole('list', { name: 'Проекты', exact: true }).getByRole('link', { name: new RegExp(SEEDED_PROJECT) }).click()
  await page.waitForURL('**/polish/**', { timeout: 30000 })
  await page.getByRole('region', { name: 'Сводка аудита' }).waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await shoot(page, `08-step7-polish-${theme}`)

  await context.close()
}

await browser.close()
console.log('done')
