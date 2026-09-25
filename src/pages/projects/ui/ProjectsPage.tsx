import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CreateProjectDialog, defaultProjectName } from '@/features/create-project'
import { useCreateProject, useProjects, type Project } from '@/entities/project'
import { isApiError } from '@/shared/api'
import { API_MODE, routes } from '@/shared/config'
import { Button, EmptyState, PageHeader, useToast } from '@/shared/ui'
import { ProjectList, ProjectListSkeleton } from '@/widgets/project-list'
import styles from './ProjectsPage.module.css'

const IS_MOCK = API_MODE === 'mock'

const DEMO_DESCRIPTION = IS_MOCK
  ? 'Готовый прогон на записанных ответах API: ДНК шаблона → план → 3 варианта → аудит → экспорт. Работает без сети и модели.'
  : 'Быстрый старт для показа: создам проект и открою загрузку шаблона. Дальше — бриф, 3 варианта, аудит и экспорт на живом сервисе.'

function seededProject(projects: readonly Project[] | undefined): Project | undefined {
  const oldestFirst = [...(projects ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  return oldestFirst.find((project) => project.template_id) ?? oldestFirst[0]
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const projects = useProjects()
  const createDemo = useCreateProject()
  const [dialogOpen, setDialogOpen] = useState(false)

  const openDemo = () => {
    const seeded = IS_MOCK ? seededProject(projects.data) : undefined
    if (seeded) {
      navigate(routes.template(seeded.id))
      return
    }
    createDemo.mutate(defaultProjectName('Демо-сценарий'), {
      onSuccess: (project) => navigate(routes.template(project.id), { state: { demo: true } }),
      onError: (error) => toast.show(isApiError(error) ? error.message : 'Не удалось создать демо-проект'),
    })
  }

  const list = projects.data ?? []

  return (
    <div className={styles.page}>
      <PageHeader
        title="Проекты"
        description="Загрузите корпоративный шаблон и бриф — получите три редактируемые колоды с аудитом качества."
        actions={
          <Button variant="primary" size="lg" onClick={() => setDialogOpen(true)}>
            + Новый проект
          </Button>
        }
      />

      <button type="button" className={styles.demo} onClick={openDemo} disabled={createDemo.isPending}>
        <span className={styles.demoIcon} aria-hidden>
          ▶
        </span>
        <span className={styles.demoText}>
          <span className={styles.demoTitle}>Демо-сценарий</span>
          <span className={styles.demoDescription}>{DEMO_DESCRIPTION}</span>
        </span>
        <span className={styles.demoAction}>{createDemo.isPending ? 'Создаю…' : 'Открыть →'}</span>
      </button>

      {projects.isPending ? (
        <ProjectListSkeleton />
      ) : projects.isError ? (
        <EmptyState
          title="Не удалось загрузить проекты"
          description={isApiError(projects.error) ? projects.error.message : 'Сервис не ответил. Проверьте, что бэкенд запущен.'}
          actions={
            <Button size="lg" onClick={() => projects.refetch()}>
              Повторить
            </Button>
          }
        />
      ) : list.length ? (
        <ProjectList projects={list} />
      ) : (
        <EmptyState
          title="Проектов пока нет"
          description="Начните с корпоративного шаблона .pptx или прошлой презентации. Система разберёт его на правила и покажет, что поняла."
          actions={
            <>
              <Button variant="primary" size="lg" onClick={() => setDialogOpen(true)}>
                Создать первый проект
              </Button>
              <Button size="lg" onClick={openDemo} disabled={createDemo.isPending}>
                Открыть демо
              </Button>
            </>
          }
        />
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(project) => {
          setDialogOpen(false)
          navigate(routes.template(project.id))
        }}
      />
    </div>
  )
}
