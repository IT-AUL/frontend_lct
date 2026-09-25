import { Outlet, useLocation, useMatch, useParams } from 'react-router'
import { latestRunId, useProject, useProjectEvidence } from '@/entities/project'
import type { RunStatus } from '@/widgets/app-header'
import { ProjectRail, stepFromPath, type ProjectProgress } from '@/widgets/project-rail'
import type { ProjectStep } from '@/shared/config'
import { AppFrame } from './AppFrame'

const COMPACT_STEPS: (ProjectStep | undefined)[] = ['variants', 'audit']

function runStatus(step: ProjectStep | undefined, progress: ProjectProgress): RunStatus | undefined {
  if (step === 'template') {
    return progress.hasTemplate ? { label: 'Шаблон разобран', tone: 'ok' } : { label: 'Нужен шаблон', tone: 'neutral' }
  }
  if (step === 'brief') {
    return progress.hasContent ? { label: 'Контент загружен', tone: 'ok' } : { label: 'Черновик брифа', tone: 'neutral' }
  }
  if (!step) return undefined
  if (progress.reaudited) return { label: 'Повторный аудит пройден', tone: 'ok' }
  if (progress.generated) return { label: 'Готово · 3 варианта', tone: 'ok' }
  return { label: 'Идёт генерация', tone: 'info' }
}

export function ProjectLayout() {
  const { projectId = '' } = useParams()
  const { pathname } = useLocation()
  const runMatch = useMatch('/projects/:projectId/runs/:runId/*')
  const { data: project } = useProject(projectId)
  const evidence = useProjectEvidence(projectId)
  const step = stepFromPath(pathname)

  const progress: ProjectProgress = {
    projectId,
    runId: runMatch?.params.runId ?? latestRunId(projectId),
    hasTemplate: Boolean(project?.template_id),
    hasContent: Boolean(project?.content_pack_id),
    targetSlides: project?.target_slide_count ?? 12,
    generated: Boolean(evidence.generated),
    repaired: Boolean(evidence.repaired),
    exported: Boolean(evidence.exported),
    reaudited: Boolean(evidence.reaudited),
  }

  return (
    <AppFrame
      projectName={project?.name ?? '…'}
      status={runStatus(step, progress)}
      rail={<ProjectRail progress={progress} current={step} compact={COMPACT_STEPS.includes(step)} />}
    >
      <Outlet />
    </AppFrame>
  )
}
