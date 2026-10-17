import type { AssistantStepNumber, AssistantStepSnapshot } from '@/widgets/assistant-bar'
import type { ProjectProgress } from '@/widgets/project-rail'
import { routes } from '@/shared/config'

export function progressSnapshot(progress: ProjectProgress): AssistantStepSnapshot {
  const { projectId, runId } = progress
  const hasMaterials = progress.hasTemplate && progress.hasContent
  const hasPlan = Boolean(progress.hasPlanDraft) || progress.generated
  const runReady = Boolean(runId) && !progress.runPending
  const completed: AssistantStepNumber[] = []
  if (hasMaterials) completed.push(1, 2, 3)
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
  return { completed, skipped: [], hrefs }
}
