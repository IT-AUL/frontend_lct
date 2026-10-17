import { Outlet, useLocation, useMatch, useParams } from 'react-router'
import { useOpenCounts } from '@/entities/audit'
import { isTrackingId, useGenerationTracker } from '@/entities/generation'
import { projectRunId, useProject, useProjectEvidence } from '@/entities/project'
import { readPlanRequest } from '@/features/edit-deck-plan'
import { AssistantBar, assistantStepFromPath, buildAssistantSteps } from '@/widgets/assistant-bar'
import { stepFromPath, type ProjectProgress } from '@/widgets/project-rail'
import { AppFrame } from './AppFrame'
import { progressSnapshot } from './assistantSnapshot'
import { runStatus } from './runStatus'

export function ProjectLayout() {
  const { projectId = '' } = useParams()
  const { pathname } = useLocation()
  const runMatch = useMatch('/projects/:projectId/runs/:runId/*')
  const { data: project } = useProject(projectId)
  const evidence = useProjectEvidence(projectId)
  const step = stepFromPath(pathname)
  const runId = runMatch?.params.runId ?? projectRunId(project, projectId)
  const tracker = useGenerationTracker(runId)
  const openCounts = useOpenCounts(projectId, runId)

  const progress: ProjectProgress = {
    projectId,
    runId,
    runPending: Boolean(runId && isTrackingId(runId)),
    hasTemplate: Boolean(project?.template_id),
    hasContent: Boolean(project?.content_pack_id),
    targetSlides: project?.target_slide_count ?? 12,
    planFirst: true,
    hasPlanDraft: readPlanRequest(projectId) !== null,
    generated: Boolean(evidence.generated) || tracker.phase === 'completed',
    repaired: Boolean(evidence.repaired),
    exported: Boolean(evidence.exported),
    reaudited: Boolean(evidence.reaudited),
  }

  return (
    <AppFrame
      projectName={project?.name ?? '…'}
      status={runStatus(step, progress, tracker, openCounts)}
    >
      <AssistantBar steps={buildAssistantSteps(progressSnapshot(progress), assistantStepFromPath(pathname))} />
      <Outlet />
    </AppFrame>
  )
}
