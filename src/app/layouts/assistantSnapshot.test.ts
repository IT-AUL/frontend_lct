import { describe, expect, it } from 'vitest'
import { progressSnapshot } from './assistantSnapshot'

const base = { projectId: 'p1', hasTemplate: false, hasContent: false, targetSlides: 10, generated: false, repaired: false, exported: false, reaudited: false }

describe('progressSnapshot', () => {
  it('only opens the first step for a new project', () => {
    const snapshot = progressSnapshot(base)
    expect(snapshot.completed).toEqual([])
    expect(Object.keys(snapshot.hrefs)).toEqual(['1'])
  })

  it('opens the plan and style steps once a draft plan exists', () => {
    const snapshot = progressSnapshot({ ...base, hasTemplate: true, hasContent: true, hasPlanDraft: true })
    expect(snapshot.completed).toEqual([1, 4])
    expect(snapshot.hrefs[5]).toBe('/projects/p1/style')
  })

  it('opens polishing only for a finished run', () => {
    const pending = progressSnapshot({ ...base, hasTemplate: true, hasContent: true, runId: 'r1', runPending: true })
    expect(pending.hrefs[7]).toBeUndefined()
    const done = progressSnapshot({ ...base, hasTemplate: true, hasContent: true, runId: 'r1', generated: true })
    expect(done.completed).toContain(6)
    expect(done.hrefs[7]).toBe('/projects/p1/runs/r1/polish')
  })

  it('takes completed, skipped and current steps from the session', () => {
    const session = { step: 4, completed_steps: [1, 2], skipped_steps: [3] } as unknown as Parameters<typeof progressSnapshot>[1]
    const snapshot = progressSnapshot({ ...base, hasTemplate: true, hasContent: true }, session)
    expect(snapshot.completed).toEqual([1, 2])
    expect(snapshot.skipped).toEqual([3])
    expect(snapshot.current).toBe(4)
    expect(snapshot.hrefs[3]).toBe('/projects/p1/questions')
  })
})
