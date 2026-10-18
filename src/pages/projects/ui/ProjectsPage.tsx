import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CreateProjectDialog, defaultProjectName } from '@/features/create-project'
import { useGeneration } from '@/entities/generation'
import { projectRunId, useCreateProject, useProjects, type Project } from '@/entities/project'
import { useTemplate } from '@/entities/template'
import { isApiError } from '@/shared/api'
import { API_MODE, routes } from '@/shared/config'
import { pluralize } from '@/shared/lib/format'
import { Badge, Button, EmptyState, Icon, PageHeader, Play, Plus, Search, Skeleton, X, useToast, type Tone } from '@/shared/ui'
import { formatRelativeDate, projectHref, ProjectListSkeleton, sortProjects, type RunLookup } from '@/widgets/project-list'
import styles from './ProjectsPage.module.css'

const IS_MOCK = API_MODE === 'mock'

const DEMO_DESCRIPTION = 'Готовый прогон: ДНК шаблона, план, три варианта, аудит и экспорт.'

function seededProject(projects: readonly Project[] | undefined): Project | undefined {
  const oldestFirst = [...(projects ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  return oldestFirst.find((project) => project.template_id) ?? oldestFirst[0]
}

function useRunLookup(runId: string | undefined): RunLookup {
  const generation = useGeneration(runId)
  if (!runId) return { kind: 'none' }
  if (generation.data) return { kind: 'ready', generation: generation.data }
  if (generation.isError) return { kind: 'missing' }
  return { kind: 'loading' }
}

interface ProjectCardMeta {
  badgeLabel: 'Готова' | 'В работе' | 'Черновик'
  badgeTone: Tone
  subtitle: string
  volumeLabel: string
}

function buildVolumeLabel(project: Project, run: RunLookup): string {
  const planSlides = run.kind === 'ready' ? run.generation.deck_plan?.slides?.length : undefined
  const slideCount = planSlides && planSlides > 0 ? planSlides : project.target_slide_count
  const slidesPart = slideCount > 0 ? `${slideCount} ${pluralize(slideCount, ['слайд', 'слайда', 'слайдов'])}` : null
  const fileCount = (project.template_id ? 1 : 0) + (project.content_pack_id ? 1 : 0)
  const filesPart = fileCount > 0 ? `${fileCount} ${pluralize(fileCount, ['файл', 'файла', 'файлов'])}` : 'без файлов'
  const variantCount = run.kind === 'ready' ? run.generation.variants.length : 0
  const variantsPart = variantCount > 0 ? `${variantCount} ${pluralize(variantCount, ['вариант', 'варианта', 'вариантов'])}` : null
  return [slidesPart, filesPart, variantsPart].filter(Boolean).join(' · ')
}

function fallbackProjectSubtitle(project: Project, templateFilename?: string): { badgeLabel: 'Готова' | 'В работе' | 'Черновик'; badgeTone: Tone; subtitle: string } {
  const templatePart = templateFilename ? `Шаблон ${templateFilename}` : null
  const runId = projectRunId(project, project.id)
  if (project.latest_run_state === 'completed' || (runId && !project.latest_run_state && project.template_id && project.content_pack_id)) {
    return {
      badgeLabel: 'Готова',
      badgeTone: 'ok',
      subtitle: templatePart ? `${templatePart} · три направления и проверка` : 'Три направления вёрстки и проверка',
    }
  }
  if (project.latest_run_state === 'running' || project.latest_run_state === 'queued' || project.latest_run_state === 'awaiting_user') {
    return {
      badgeLabel: 'В работе',
      badgeTone: project.latest_run_state === 'awaiting_user' ? 'warn' : 'info',
      subtitle: templatePart ? `${templatePart} · собираю презентацию` : 'Собираю презентацию',
    }
  }
  if (project.template_id && project.content_pack_id) {
    return {
      badgeLabel: 'В работе',
      badgeTone: 'info',
      subtitle: templatePart ? `${templatePart} · материалы разобраны` : 'Шаблон и материалы загружены',
    }
  }
  if (project.template_id) {
    return {
      badgeLabel: 'Черновик',
      badgeTone: 'neutral',
      subtitle: templatePart ? `${templatePart} · добавьте материалы или тему` : 'Шаблон разобран · добавьте материалы или тему',
    }
  }
  return {
    badgeLabel: 'Черновик',
    badgeTone: 'neutral',
    subtitle: 'Шаг 1 · добавьте корпоративный шаблон и материалы',
  }
}

function resolveProjectCardMeta(project: Project, run: RunLookup, templateFilename?: string): ProjectCardMeta {
  const templatePart = templateFilename ? `Шаблон ${templateFilename}` : null
  const volumeLabel = buildVolumeLabel(project, run)
  if (run.kind === 'ready') {
    const { generation } = run
    if (generation.state === 'completed') {
      return {
        badgeLabel: 'Готова',
        badgeTone: 'ok',
        subtitle: templatePart ? `${templatePart} · три направления и проверка` : 'Три направления вёрстки и проверка',
        volumeLabel,
      }
    }
    if (generation.state === 'running' || generation.state === 'queued' || generation.state === 'awaiting_user') {
      return {
        badgeLabel: 'В работе',
        badgeTone: generation.state === 'awaiting_user' ? 'warn' : 'info',
        subtitle:
          generation.state === 'awaiting_user'
            ? 'Ждёт вашего решения'
            : templatePart
              ? `${templatePart} · собираю презентацию`
              : 'Собираю презентацию',
        volumeLabel,
      }
    }
    if (generation.state === 'failed') {
      return {
        badgeLabel: 'В работе',
        badgeTone: 'error',
        subtitle: 'Сборка прервалась — откройте, чтобы повторить',
        volumeLabel,
      }
    }
  }
  const base = fallbackProjectSubtitle(project, templateFilename)
  return {
    ...base,
    volumeLabel,
  }
}

function matchesProjectSearch(project: Project, query: string): boolean {
  if (!query) return true
  const base = fallbackProjectSubtitle(project)
  const volume = buildVolumeLabel(project, { kind: 'none' })
  const haystack = `${project.name} ${base.subtitle} ${base.badgeLabel} ${volume}`.toLowerCase()
  return haystack.includes(query)
}

function ProjectCard({ project }: { project: Project }) {
  const runId = projectRunId(project, project.id)
  const run = useRunLookup(runId)
  const template = useTemplate(project.template_id)
  const meta = resolveProjectCardMeta(project, run, template.data?.filename)

  return (
    <li className={styles.cardItem}>
      <Link to={projectHref(project, runId, run)} className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.cardTitle}>{project.name}</span>
          <span className={styles.cardBadge}>
            {run.kind === 'loading' ? (
              <Skeleton className={styles.badgeSkeleton} />
            ) : (
              <Badge tone={meta.badgeTone} dot>
                {meta.badgeLabel}
              </Badge>
            )}
          </span>
        </div>
        <p className={styles.cardSubtitle}>{meta.subtitle}</p>
        <div className={styles.cardMeta}>
          <span className={styles.cardVolume}>{meta.volumeLabel}</span>
          <time className={styles.cardDate} dateTime={project.updated_at}>
            {formatRelativeDate(project.updated_at)}
          </time>
        </div>
      </Link>
    </li>
  )
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const projects = useProjects()
  const createDemo = useCreateProject()
  const quickCreate = useCreateProject()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const openDemo = () => {
    const seeded = seededProject(projects.data)
    if (seeded) {
      navigate(routes.start(seeded.id))
      return
    }
    createDemo.mutate(defaultProjectName('Демо'), {
      onSuccess: (project) => navigate(routes.start(project.id)),
      onError: (error) => toast.show(isApiError(error) ? error.message : 'Не удалось открыть демо'),
    })
  }

  const startQuickProject = () => {
    if (quickCreate.isPending) return
    quickCreate.mutate(defaultProjectName('Новый проект'), {
      onSuccess: (project) => navigate(routes.start(project.id)),
      onError: (error) => toast.show(isApiError(error) ? error.message : 'Не удалось создать проект'),
    })
  }

  const list = useMemo(() => sortProjects(projects.data ?? []), [projects.data])
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredList = useMemo(
    () => (normalizedQuery ? list.filter((project) => matchesProjectSearch(project, normalizedQuery)) : list),
    [list, normalizedQuery],
  )

  return (
    <div className={styles.page}>
      <PageHeader
        title="Проекты"
        description="Шаблон и бриф на входе — три редактируемые колоды с аудитом на выходе."
        actions={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="lg" onClick={startQuickProject} disabled={quickCreate.isPending}>
              {quickCreate.isPending ? 'Создаю…' : 'Быстрый старт'}
            </Button>
            <Button variant="primary" size="lg" onClick={() => setDialogOpen(true)}>
              <Icon as={Plus} />
              Новый проект
            </Button>
          </div>
        }
      />

      {IS_MOCK && (
        <button type="button" className={styles.demo} onClick={openDemo} disabled={createDemo.isPending}>
          <span className={styles.demoIcon} aria-hidden>
            <Icon as={Play} size={14} />
          </span>
          <span className={styles.demoText}>
            <span className={styles.demoTitle}>Демо</span>
            <span className={styles.demoDescription}>{DEMO_DESCRIPTION}</span>
          </span>
          <span className={styles.demoAction}>{createDemo.isPending ? 'Открываю…' : 'Открыть'}</span>
        </button>
      )}

      {!projects.isPending && !projects.isError && list.length > 3 && (
        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span className={styles.searchIcon} aria-hidden>
              <Icon as={Search} size={15} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Найти проект по названию или подписи…"
              aria-label="Поиск по проектам"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
              >
                <Icon as={X} size={14} />
              </button>
            )}
          </label>
          <span className={styles.searchCount}>
            {normalizedQuery
              ? `Найдено ${filteredList.length} из ${list.length}`
              : `${list.length} ${pluralize(list.length, ['проект', 'проекта', 'проектов'])}`}
          </span>
        </div>
      )}

      {projects.isPending ? (
        <ProjectListSkeleton />
      ) : projects.isError ? (
        <EmptyState
          title="Не удалось загрузить проекты"
          description={isApiError(projects.error) ? projects.error.message : 'Сервис не ответил.'}
          actions={
            <Button size="lg" onClick={() => projects.refetch()}>
              Повторить
            </Button>
          }
        />
      ) : list.length ? (
        filteredList.length ? (
          <ul className={styles.projectGrid} aria-label="Проекты">
            {filteredList.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Проекты не найдены"
            description="Попробуйте другое слово из названия или подписи проекта."
            actions={
              <Button variant="secondary" size="lg" onClick={() => setSearchQuery('')}>
                Сбросить поиск
              </Button>
            }
          />
        )
      ) : (
        <EmptyState
          title="Проектов пока нет"
          description="Начните с корпоративного шаблона или прошлой презентации."
          actions={
            <div className={styles.headerActions}>
              <Button variant="secondary" size="lg" onClick={startQuickProject} disabled={quickCreate.isPending}>
                {quickCreate.isPending ? 'Создаю…' : 'Быстрый старт'}
              </Button>
              <Button variant="primary" size="lg" onClick={() => setDialogOpen(true)}>
                Создать первый проект
              </Button>
            </div>
          }
        />
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(project) => {
          setDialogOpen(false)
          navigate(routes.start(project.id))
        }}
      />
    </div>
  )
}
