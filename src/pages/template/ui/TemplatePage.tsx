import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { TemplateDropzone, UploadProgress, useTemplateUpload } from '@/features/upload-template'
import { useProject } from '@/entities/project'
import { analysisState, useDesignDna, useTemplate, type TemplateDetail } from '@/entities/template'
import { isApiError } from '@/shared/api'
import { routes } from '@/shared/config'
import { Button, EmptyState, PageHeader } from '@/shared/ui'
import { DesignDna, DesignDnaSkeleton } from '@/widgets/design-dna'
import styles from './TemplatePage.module.css'

const ANALYSIS_POLL_MS = 1500

function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback
}

function useAnalysisPolling(detail: TemplateDetail | undefined, refetch: () => unknown) {
  const running = analysisState(detail) === 'running'
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => void refetch(), ANALYSIS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [running, refetch])
}

export function TemplatePage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const demo = Boolean((location.state as { demo?: boolean } | null)?.demo)

  const project = useProject(projectId)
  const upload = useTemplateUpload(projectId)
  const [replacing, setReplacing] = useState(false)

  const templateId = project.data?.template_id ?? null
  const template = useTemplate(templateId)
  const state = analysisState(template.data)
  const dna = useDesignDna(templateId, state === 'completed')
  useAnalysisPolling(template.data, template.refetch)

  const { analyze } = upload
  const autoAnalyzed = useRef<string | null>(null)
  const phase = upload.state.phase
  useEffect(() => {
    const detail = template.data
    if (!detail || state !== 'missing' || phase !== 'idle' || autoAnalyzed.current === detail.id) return
    autoAnalyzed.current = detail.id
    void analyze(detail.id, { name: detail.filename, size: detail.size_bytes })
  }, [template.data, state, phase, analyze])

  const onFile = async (file: File) => {
    if (await upload.upload(file)) setReplacing(false)
  }

  const startReplace = () => {
    upload.reset()
    setReplacing(true)
  }

  const cancelReplace = () => {
    upload.reset()
    setReplacing(false)
  }

  const showDna = Boolean(templateId) && !replacing && phase !== 'uploading' && phase !== 'analyzing' && state === 'completed'

  const renderBody = () => {
    if (upload.state.phase === 'uploading') {
      return <UploadProgress phase="uploading" fileName={upload.state.file.name} totalBytes={upload.state.file.size} progress={upload.state.progress} />
    }
    if (upload.state.phase === 'analyzing') {
      return <UploadProgress phase="analyzing" fileName={upload.state.file.name} totalBytes={upload.state.file.size} />
    }
    if (project.isPending) return <DesignDnaSkeleton />
    if (project.isError) {
      return (
        <EmptyState
          title="Проект не найден"
          description={errorText(project.error, 'Сервис не ответил.')}
          actions={
            <Button size="lg" onClick={() => navigate(routes.projects())}>
              К проектам
            </Button>
          }
        />
      )
    }

    const failedAnalysis = upload.state.phase === 'error' && upload.state.templateId ? upload.state : null
    if (!templateId || replacing) {
      return (
        <div className={styles.upload}>
          {demo && !templateId && (
            <div className={styles.hint} role="note">
              <b>Демо-сценарий.</b> Загрузите корпоративный шаблон или прошлую презентацию — например, любой шаблон из датасета. Дальше система разберёт его, соберёт три варианта и проверит их.
            </div>
          )}
          <TemplateDropzone onFile={onFile} error={upload.state.phase === 'error' && !failedAnalysis ? upload.state.message : null} />
          {failedAnalysis && (
            <p className={styles.error} role="alert">
              {failedAnalysis.message}
            </p>
          )}
          {replacing && templateId && (
            <div>
              <Button variant="ghost" onClick={cancelReplace}>
                ← Вернуться к текущему шаблону
              </Button>
            </div>
          )}
        </div>
      )
    }

    if (template.isPending) return <DesignDnaSkeleton />
    if (template.isError) {
      return (
        <EmptyState
          title="Не удалось открыть шаблон"
          description={errorText(template.error, 'Сервис не ответил.')}
          actions={
            <>
              <Button size="lg" onClick={() => template.refetch()}>
                Повторить
              </Button>
              <Button size="lg" onClick={startReplace}>
                Загрузить заново
              </Button>
            </>
          }
        />
      )
    }

    const detail = template.data
    if (state === 'failed' || failedAnalysis) {
      const warnings = detail.latest_analysis?.warnings ?? []
      return (
        <EmptyState
          title="Шаблон не удалось разобрать"
          description={
            <>
              {failedAnalysis?.message ?? `Анализ «${detail.filename}» завершился ошибкой.`}
              {warnings.length > 0 && (
                <span className={styles.warnings}>
                  {warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </span>
              )}
            </>
          }
          actions={
            <>
              <Button variant="primary" size="lg" onClick={() => void analyze(detail.id, { name: detail.filename, size: detail.size_bytes })}>
                Повторить анализ
              </Button>
              <Button size="lg" onClick={startReplace}>
                Заменить шаблон
              </Button>
            </>
          }
        />
      )
    }

    if (state !== 'completed') return <UploadProgress phase="analyzing" fileName={detail.filename} totalBytes={detail.size_bytes} />
    if (dna.isPending) return <DesignDnaSkeleton />
    return <DesignDna detail={detail} dna={dna.data} />
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Шаг 1 · Шаблон"
        title="ДНК шаблона"
        description={
          showDna
            ? 'Шаблон разобран на правила: цвета, шрифты, кегли, сетку, якоря и макеты. По этим правилам будут собираться новые слайды.'
            : 'Загрузите корпоративный шаблон или прошлую презентацию — система разберёт его на правила: цвета, шрифты, кегли, сетку, якоря и макеты.'
        }
        actions={
          showDna ? (
            <>
              <Button size="lg" onClick={startReplace}>
                Заменить шаблон
              </Button>
              <Button variant="primary" size="lg" onClick={() => navigate(routes.brief(projectId))}>
                Дальше: бриф →
              </Button>
            </>
          ) : undefined
        }
      />
      {renderBody()}
    </div>
  )
}
