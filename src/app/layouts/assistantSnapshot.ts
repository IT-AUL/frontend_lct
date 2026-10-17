import type { AssistantSession } from '@/entities/assistant'
import type { AssistantStepNumber, AssistantStepSnapshot } from '@/widgets/assistant-bar'
import type { ProjectProgress } from '@/widgets/project-rail'
import { routes } from '@/shared/config'

export function progressSnapshot(progress: ProjectProgress, session?: AssistantSession | null): AssistantStepSnapshot {
  const { projectId, runId } = progress
  const hasMaterials = progress.hasTemplate && progress.hasContent
  const hasPlan = Boolean(progress.hasPlanDraft) || progress.generated
  const runReady = Boolean(runId) && !progress.runPending
  const completed: AssistantStepNumber[] = []
  if (hasMaterials) completed.push(1)
  if (hasPlan) completed.push(4)
  if (progress.generated) completed.push(5, 6)
  if (progress.repaired || progress.exported) completed.push(7)
  const hrefs: AssistantStepSnapshot['hrefs'] = { 1: routes.start(projectId) }
  if (progress.hasTemplate) {
    hrefs[2] = routes.understanding(projectId)
    hrefs[3] = routes.questions(projectId)
  }
  if (progress.hasPlanDraft) {
    hrefs[4] = routes.planDraft(projectId)
    hrefs[5] = routes.style(projectId)
  } else if (runId && runReady) {
    hrefs[4] = routes.plan(projectId, runId)
  }
  if (runId) hrefs[6] = routes.run(projectId, runId)
  if (runId && runReady && progress.generated) hrefs[7] = routes.polish(projectId, runId)
  if (!session) return { completed, skipped: [], hrefs }
  const merged = [...new Set<AssistantStepNumber>([...completed, ...session.completed_steps])]
  for (const step of [...session.completed_steps, ...session.skipped_steps, session.step]) {
    if (step === 2 && !hrefs[2]) hrefs[2] = routes.understanding(projectId)
    if (step === 3 && !hrefs[3]) hrefs[3] = routes.questions(projectId)
  }
  return { completed: merged, skipped: session.skipped_steps, current: session.step, hrefs }
}
