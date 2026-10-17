import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAssistantSession, useBrandbookSummary, useIntake, useJobEvents, useSetBrandPriority, useSetIntakeKind, useStartAutopilot, useTemplateSummary } from '@/entities/assistant'
import type { BrandPriority, IntakeFile, IntakeKind, IntakeResult } from '@/entities/assistant'
import { uploadContentPack } from '@/entities/content-pack'
import { useInvalidateProject, useProject } from '@/entities/project'
import { analysisState, uploadTemplate, useDesignDna, useTemplate } from '@/entities/template'
import { isApiError } from '@/shared/api'
import { routes } from '@/shared/config'
import { pluralize } from '@/shared/lib/format'
import { ArrowRight, Badge, Button, Card, Drawer, EmptyState, Field, Icon, Meter, PageHeader, Skeleton, TextArea, useToast, Wand2 } from '@/shared/ui'
import { useReportAssistantNote } from '@/widgets/assistant-bar'
import { DesignDna, DesignDnaSkeleton } from '@/widgets/design-dna'
import { BrandbookSummaryCard, guessKind, IntakeDropzone, IntakeFileList, isContentFile, isIntakeFile, mergeIntakeFiles, TemplateSummaryCard } from '@/widgets/intake-board'
import type { PendingFile } from '@/widgets/intake-board'
import styles from './IntakePage.module.css'

function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback
}

function legacyFile(file: File): IntakeFile {
  const supported = isIntakeFile(file.name)
  const kind = supported ? guessKind(file.name) : 'unknown'
  return { name: file.name, detected_kind: kind, kind, accepted: supported, reason: supported ? null : 'формат не поддерживается', size_bytes: file.size }
}

function localNote(state: { files: IntakeFile[]; templateId: string | null; hasContent: boolean; analyzing: boolean }): string {
  if (state.analyzing) return 'Читаю ваш шаблон: смотрю мастер-слайды, палитру и шрифты…'
  if (state.templateId && !state.hasContent) return 'Шаблон готов — осталось закинуть файл с материалами или коротко написать, о чём выступление.'
  if (!state.templateId && state.hasContent) return 'Материалы принял — добавьте корпоративный шаблон .pptx или .potx, чтобы я знал правила оформления.'
  if (state.files.length) return 'Разложил файлы по типам — проверьте чипы, поправить можно кликом.'
  return 'Закиньте всё, что есть: шаблон, тексты, таблицы, брендбук. Разберусь сам.'
}

export function IntakePage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const invalidateProject = useInvalidateProject()

  const project = useProject(projectId)
  const session = useAssistantSession(projectId)
  const upload = useIntake(projectId)
  const patchKind = useSetIntakeKind(projectId)
  const autopilot = useStartAutopilot(projectId)

  const [idea, setIdea] = useState('')
  const [files, setFiles] = useState<IntakeFile[]>([])
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [intake, setIntake] = useState<IntakeResult | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const intakeMissing = useRef(false)
  const [advancing, setAdvancing] = useState(false)
  const [dnaOpen, setDnaOpen] = useState(false)
  const [priorityOverride, setPriorityOverride] = useState<BrandPriority | null>(null)
  const [autopilotStarted, setAutopilotStarted] = useState(false)
  const [legacyError, setLegacyError] = useState<string | null>(null)

  const artifacts = session.data?.artifacts
  const templateId = intake?.template_id ?? artifacts?.template_id ?? project.data?.template_id ?? null
  const packId = intake?.content_pack_id ?? artifacts?.content_pack_id ?? project.data?.content_pack_id ?? null
  const brandbookId = intake?.brandbook_id ?? artifacts?.brandbook_id ?? null

  const templateSummary = useTemplateSummary(templateId)
  const brandbookSummary = useBrandbookSummary(brandbookId)
  const patchPriority = useSetBrandPriority(brandbookId ?? '')
  const templateDetail = useTemplate(dnaOpen ? templateId : null)
  const dna = useDesignDna(templateId, dnaOpen)
  const job = useJobEvents(autopilotStarted ? session.data?.job_id : null)

  useEffect(() => {
    const generationId = session.data?.artifacts.generation_id
    if (autopilotStarted && generationId) navigate(routes.run(projectId, generationId), { replace: true })
  }, [autopilotStarted, session.data, projectId, navigate])

  const applyIntake = (data: IntakeResult) => {
    setIntake(data)
    setFiles((prev) => mergeIntakeFiles(prev, data.files))
    if (data.assistant_note) setNote(data.assistant_note)
  }

  const sendFilesLegacy = async (picked: File[]) => {
    setFiles((prev) => mergeIntakeFiles(prev, picked.map(legacyFile)))
    setPendingFiles(picked.map((file) => ({ name: file.name, size: file.size })))
    setLegacyError(null)
    const templates = picked.filter((file) => /\.(pptx|potx)$/i.test(file.name))
    const templateNames = new Set(templates)
    const others = picked.filter((file) => !templateNames.has(file) && isIntakeFile(file.name))
    const text = idea.trim()
    const ideaFile = text ? new File([text], 'idea.md', { type: 'text/markdown' }) : null
    try {
      if (templates[0]) await uploadTemplate(projectId, templates[0])
      const rest = [...templates.slice(1), ...others, ...(ideaFile ? [ideaFile] : [])]
      if (rest.length) await uploadContentPack(projectId, rest, text ? { topic: text } : {})
      void invalidateProject(projectId)
      setNote('Принял по прежнему пути: шаблон и материалы по отдельности.')
    } catch (error) {
      setLegacyError(errorText(error, 'Не удалось отправить файлы.'))
    } finally {
      setPendingFiles([])
    }
  }

  const sendFiles = (picked: File[]) => {
    if (!picked.length || upload.isPending) return
    setLegacyError(null)
    if (intakeMissing.current) {
      void sendFilesLegacy(picked)
      return
    }
    setPendingFiles(picked.map((file) => ({ name: file.name, size: file.size })))
    upload.mutate(
      { files: picked, idea: idea.trim() || undefined },
      {
        onSuccess: (data) => {
          setPendingFiles([])
          if (data) applyIntake(data)
          else {
            intakeMissing.current = true
            void sendFilesLegacy(picked)
          }
        },
        onError: () => setPendingFiles([]),
      },
    )
  }

  const changeKind = (name: string, kind: IntakeKind) => {
    const previous = files
    setFiles(files.map((file) => (file.name === name ? { ...file, kind, accepted: true, reason: 'тип выбран вручную' } : file)))
    patchKind.mutate(
      { name, kind },
      {
        onSuccess: (data) => {
          if (data) applyIntake(data)
        },
        onError: () => {
          setFiles(previous)
          toast.show('Не удалось поменять тип файла')
        },
      },
    )
  }

  const removeFile = (name: string) => {
    setFiles((list) => list.filter((file) => file.name !== name))
  }

  const changePriority = (priority: BrandPriority) => {
    setPriorityOverride(priority)
    patchPriority.mutate(
      { priority },
      {
        onSuccess: (data) => {
          if (data?.assistant_note) setNote(data.assistant_note)
        },
        onError: () => {
          setPriorityOverride(null)
          toast.show('Не удалось поменять приоритет')
        },
        onSettled: () => setPriorityOverride(null),
      },
    )
  }

  const hasContent = Boolean(packId) || files.some(isContentFile) || Boolean(idea.trim())
  const hasAnything = Boolean(templateId) || files.some((file) => file.accepted) || Boolean(idea.trim())
  const canContinue = Boolean(templateId) && hasContent && !advancing
  const busy = upload.isPending || pendingFiles.length > 0 || advancing
  const analyzing = Boolean(templateId) && templateSummary.isPending
  const autopilotFailed = autopilotStarted && job.done && !session.data?.artifacts.generation_id
  const autopilotRunning = autopilotStarted && !autopilotFailed
  const assistantNote = autopilotFailed
    ? 'Сборка не запустилась — продолжим по шагам.'
    : (note ?? (templateSummary.data?.assistant_note || brandbookSummary.data?.assistant_note || session.data?.assistant_note || localNote({ files, templateId, hasContent, analyzing })))
  useReportAssistantNote(projectId, project.data ? assistantNote : null)

  const goNext = () => {
    if (!canContinue) return
    const text = idea.trim()
    if (text && !packId) {
      setAdvancing(true)
      if (intakeMissing.current) {
        uploadContentPack(projectId, [new File([text], 'idea.md', { type: 'text/markdown' })], { topic: text })
          .then(() => navigate(routes.understanding(projectId)))
          .catch(() => setAdvancing(false))
        return
      }
      upload.mutate(
        { files: [], idea: text },
        {
          onSuccess: (data) => {
            if (data) applyIntake(data)
            navigate(routes.understanding(projectId))
          },
          onError: () => setAdvancing(false),
        },
      )
      return
    }
    navigate(routes.understanding(projectId))
  }

  const runAutopilot = () => {
    if (autopilot.isPending) return
    setAutopilotStarted(true)
    autopilot.mutate(
      { from_step: 1 },
      {
        onSuccess: (data) => {
          if (!data) {
            setAutopilotStarted(false)
            setNote('Пойдём по шагам — жмите «Дальше».')
            return
          }
          if (data.assistant_note) setNote(data.assistant_note)
        },
        onError: () => setAutopilotStarted(false),
      },
    )
  }

  if (project.isPending) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton style={{ height: 76, borderRadius: 12 }} />
        <Skeleton style={{ height: 56, borderRadius: 10 }} />
        <Skeleton style={{ height: 220, borderRadius: 14 }} />
      </div>
    )
  }

  if (project.isError || !project.data) {
    return (
      <div className={styles.page}>
        <EmptyState
          title="Проект не найден"
          description={errorText(project.error, 'Сервис не ответил.')}
          actions={
            <Button size="lg" onClick={() => navigate(routes.projects())}>
              К проектам
            </Button>
          }
        />
      </div>
    )
  }

  const uploadError = legacyError ?? (upload.error ? errorText(upload.error, 'Не удалось отправить файлы.') : null)
  const priorityValue = priorityOverride ?? brandbookSummary.data?.priority ?? 'brandbook'
  const contentFiles = files.filter(isContentFile).length
  const statusParts = [
    templateId ? 'Шаблон' : null,
    contentFiles ? `${contentFiles} ${pluralize(contentFiles, ['файл', 'файла', 'файлов'])}` : null,
    brandbookId ? 'Брендбук' : null,
    idea.trim() ? 'Идея' : null,
  ].filter(Boolean)

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Приём материалов и правил оформления"
        title="Закинь, что есть"
        description="Сложите в одну зону шаблон, таблицы, документы и брендбук — я сам определю роль каждого файла."
      />

      <Card padding="lg" className={styles.panel} aria-label="Файлы и идея">
        <Field label="Идея одной фразой" hint="можно написать только её и приложить шаблон">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={idea}
              placeholder="Например: итоги продаж за два года для совета директоров"
              onChange={(event) => setIdea(event.target.value)}
            />
          )}
        </Field>

        <IntakeDropzone onFiles={sendFiles} disabled={busy || autopilotRunning} compact={files.length > 0} />
        {busy && pendingFiles.length > 0 && (
          <div className={styles.progress} role="status">
            <span className={styles.progressLabel}>Загружаю и раскладываю…</span>
            <Meter value={upload.progress || 0} height={6} label="Прогресс загрузки" className={styles.progressMeter} />
          </div>
        )}
        {uploadError && (
          <p className={styles.error} role="alert">
            {uploadError}
          </p>
        )}
        {files.length > 0 && <p className={styles.listCaption}>Загруженные файлы ({files.length}) · клик по роли меняет назначение файла:</p>}
        <IntakeFileList files={files} onKindChange={changeKind} onRemove={removeFile} pending={patchKind.isPending || upload.isPending} uploading={pendingFiles} />
      </Card>

      {(templateSummary.data || brandbookSummary.data || analyzing || (brandbookId && brandbookSummary.isPending)) && (
        <div className={styles.cards}>
          {analyzing ? (
            <Card padding="lg" className={styles.skeletonCard} aria-label="Разбираю шаблон">
              <Skeleton style={{ height: 18, width: '50%' }} />
              <div className={styles.skeletonSwatches}>
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} style={{ width: 84, height: 24, borderRadius: 6 }} delay={index * 0.1} />
                ))}
              </div>
              <Skeleton style={{ height: 14, width: '70%' }} delay={0.2} />
            </Card>
          ) : null}
          {templateSummary.data ? <TemplateSummaryCard summary={templateSummary.data} onOpenDna={() => setDnaOpen(true)} /> : null}
          {brandbookId && brandbookSummary.isPending ? (
            <Card padding="lg" className={styles.skeletonCard} aria-label="Разбираю брендбук">
              <Skeleton style={{ height: 18, width: '40%' }} />
              <Skeleton style={{ height: 14, width: '80%' }} delay={0.1} />
              <Skeleton style={{ height: 14, width: '60%' }} delay={0.2} />
            </Card>
          ) : null}
          {brandbookSummary.data ? (
            <BrandbookSummaryCard summary={brandbookSummary.data} priority={priorityValue} onPriority={changePriority} pending={patchPriority.isPending} />
          ) : null}
        </div>
      )}

      {autopilotRunning && (
        <div className={styles.autopilot} role="status">
          <span className={styles.progressLabel}>{job.lastEvent?.message ?? 'Принимаю варианты по умолчанию и собираю колоду…'}</span>
          <Meter value={job.lastEvent?.progress ?? 0} height={6} label="Прогресс сборки" className={styles.progressMeter} />
        </div>
      )}

      <div className={styles.actions}>
        {canContinue ? (
          <p className={styles.status}>
            <Badge tone="ok" dot>
              Готово к разбору смысла
            </Badge>
            {statusParts.join(' + ')}
          </p>
        ) : (
          <p className={styles.actionsHint}>
            {hasAnything ? 'Для перехода дальше нужны шаблон и хотя бы один материал или идея.' : 'Загрузите шаблон (.pptx / .potx) и добавьте материалы или идею.'}
          </p>
        )}
        <div className={styles.buttons}>
          <Button size="lg" onClick={runAutopilot} disabled={!hasAnything || autopilot.isPending || autopilotRunning} title="Приму подходящие настройки и соберу колоду">
            <Icon as={Wand2} />
            {autopilot.isPending || autopilotRunning ? 'Запускаю сборку…' : 'Сделай сам'}
          </Button>
          <Button variant="primary" size="lg" onClick={goNext} disabled={!canContinue || autopilotRunning}>
            {advancing ? 'Отправляю…' : 'Дальше'}
            <Icon as={ArrowRight} />
          </Button>
        </div>
      </div>

      <Drawer open={dnaOpen} onOpenChange={setDnaOpen} title="ДНК шаблона" description="Правила, по которым соберутся новые слайды.">
        {templateDetail.isPending || (dnaOpen && dna.isPending) ? (
          <DesignDnaSkeleton />
        ) : templateDetail.isError || !templateDetail.data ? (
          <EmptyState title="Не удалось открыть шаблон" description={errorText(templateDetail.error, 'Сервис не ответил.')} />
        ) : analysisState(templateDetail.data) !== 'completed' ? (
          <EmptyState title="Шаблон ещё разбирается" description="Как только анализ закончится, здесь появятся все правила оформления." />
        ) : dna.isError || !dna.data ? (
          <EmptyState title="ДНК пока недоступна" description={errorText(dna.error, 'Анализ шаблона ещё идёт.')} />
        ) : (
          <DesignDna detail={templateDetail.data} dna={dna.data} />
        )}
      </Drawer>
    </div>
  )
}
