import { variantFixtures as fixtures } from '@/shared/api/mocks'
import type { AuditIssue } from '../model/types'
import { canAutoFix, issueSignature } from './issues'
import { diffRepair, dismissalEntry } from './journal'
import { describeMeasurement } from './measurement'
import {
  buildIssueViews,
  countByCategory,
  countOpenCritical,
  DEFAULT_VIEW_FILTER,
  filterIssueViews,
  groupIssueViews,
  pruneSelection,
  selectableIds,
  toggleSelection,
  withSelection,
} from './views'

const issues = fixtures.balanced.issues

describe('issue views', () => {
  it('only lets auto-fixable open issues be selected', () => {
    const views = buildIssueViews(issues, [])
    const ids = selectableIds(views)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThan(issues.length)
    for (const view of views) expect(view.selectable).toBe(canAutoFix(view.issue))
    const fontScale = issues.find((issue) => issue.rule_code === 'template.font_scale') as AuditIssue
    expect(ids).not.toContain(fontScale.id)
  })

  it('drops selected ids that are no longer selectable', () => {
    const views = buildIssueViews(issues, [])
    const [first] = selectableIds(views)
    const fontScale = issues.find((issue) => issue.rule_code === 'template.font_scale') as AuditIssue
    const selected = pruneSelection(new Set([first as string, fontScale.id, 'gone']), selectableIds(views))
    expect([...selected]).toEqual([first])
    expect(toggleSelection(selected, first as string).size).toBe(0)
    expect(withSelection(views, selected).find((view) => view.issue.id === first)?.status).toBe('selected')
  })

  it('shows fixed issues from the journal and keeps failed ones open for action', () => {
    const contrast = issues.filter((issue) => issue.rule_code === 'accessibility.contrast').slice(0, 2) as [AuditIssue, AuditIssue]
    const remaining = issues.filter((issue) => issue !== contrast[0])
    const journal = diffRepair(contrast, remaining, 2, '2026-09-25T10:00:00Z')
    const views = buildIssueViews(remaining, journal)
    expect(views).toHaveLength(issues.length)
    expect(views.find((view) => view.issue === contrast[0])?.status).toBe('fixed')
    const failed = views.find((view) => view.issue === contrast[1])
    expect(failed?.status).toBe('unresolved')
    expect(failed?.selectable).toBe(false)
    expect(filterIssueViews(views, DEFAULT_VIEW_FILTER)).toHaveLength(issues.length - 1)
    expect(filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, status: 'resolved' })).toHaveLength(1)
  })

  it('does not duplicate fixed issues the backend keeps in the list', () => {
    const [first] = issues as [AuditIssue]
    const reaudit = issues.map((issue) => (issue === first ? { ...issue, status: 'fixed' as const } : issue))
    const journal = diffRepair([first], reaudit, 2)
    const views = buildIssueViews(reaudit, journal)
    expect(views).toHaveLength(issues.length)
    expect(views.find((view) => view.issue.id === first.id)).toMatchObject({ status: 'fixed', note: { outcome: 'fixed', revision: 2 } })
  })

  it('keeps the dismissal reason next to a dismissed issue', () => {
    const [first] = issues as [AuditIssue]
    const dismissed = { ...first, status: 'dismissed' as const }
    const views = buildIssueViews([dismissed], [dismissalEntry(first, 'Ложное срабатывание', 1)])
    expect(views[0]?.status).toBe('dismissed')
    expect(views[0]?.note?.reason).toBe('Ложное срабатывание')
    expect(views[0]?.note?.signature).toBe(issueSignature(first))
  })

  it('filters by check kind, category and fixability', () => {
    const views = buildIssueViews(issues, [])
    expect(filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, kind: 'N' })).toHaveLength(0)
    const brand = filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, category: 'brand' })
    expect(brand.length).toBe(countByCategory(views).brand)
    expect(filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, fixableOnly: true }).every((view) => view.selectable)).toBe(true)
  })

  it('groups views by slide and by category', () => {
    const views = buildIssueViews(issues, [])
    const bySlide = groupIssueViews(views, 'slide', (number) => `Заголовок ${number}`)
    expect(bySlide[0]?.label).toBe('Слайд 01 · Заголовок 1')
    expect(bySlide.reduce((sum, group) => sum + group.views.length, 0)).toBe(views.length)
    expect(groupIssueViews(views, 'category').map((group) => group.key)).toEqual(['brand', 'layout', 'text'])
  })

  it('counts open critical issues', () => {
    const views = buildIssueViews(issues, [])
    expect(countOpenCritical(views)).toBe(54)
  })
})

describe('describeMeasurement', () => {
  it('adds units for known rules', () => {
    expect(describeMeasurement({ rule_code: 'accessibility.contrast', measured_value: 3.23, threshold: 4.5 })).toMatchObject({
      measured: '3.23:1',
      threshold: '≥ 4.5:1',
    })
    expect(describeMeasurement({ rule_code: 'template.font_scale', measured_value: 0.1429, threshold: 0.1 })).toMatchObject({
      measured: '14.3%',
      threshold: '≤ 10%',
    })
  })

  it('keeps raw values for other rules', () => {
    expect(describeMeasurement({ rule_code: 'image.aspect_ratio', measured_value: 0.381, threshold: '0.334 ±3%' })).toEqual({
      measured: '0.38',
      threshold: '0.334 ±3%',
      hasValue: true,
    })
    expect(describeMeasurement({ rule_code: 'content.spelling', measured_value: null, threshold: null }).hasValue).toBe(false)
  })
})
