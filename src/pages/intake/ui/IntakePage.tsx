import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAssistantSession, useBrandbookSummary, useIntake, useJobEvents, useSetBrandPriority, useSetIntakeKind, useStartAutopilot, useTemplateSummary } from '@/entities/assistant'
import type { BrandPriority, IntakeFile, IntakeKind, IntakeResult } from '@/entities/assistant'
import { uploadContentPack, useContentPack } from '@/entities/content-pack'
import { useInvalidateProject, useProject } from '@/entities/project'
import { buildDesignSystem, uploadTemplate, useDesignDna, useTemplate } from '@/entities/template'
import { isApiError } from '@/shared/api'
import { routes } from '@/shared/config'
import { Button, ChoiceListSkeleton, EmptyState, PassportSkeleton, Segmented, useToast } from '@/shared/ui'
import { DesignDnaSkeleton } from '@/widgets/design-dna'
import { guessKind, IntakeDropzone, isContentFile, isIntakeFile, mergeIntakeFiles } from '@/widgets/intake-board'
import type { PendingFile } from '@/widgets/intake-board'
import { StepShell } from '@/widgets/step-shell'
import { existingFiles, topicFromBrief, withoutColorCodes } from '../lib/existing'
import { dnaFileName, downloadJson, previewIds } from '../lib/passport'
import { useAnalyzeBrandbook } from '../model/useAnalyzeBrandbook'
import { ExistingRows, FileRows } from './FileRows'
import { TemplateRules } from './TemplateRules'
import { TemplateTable } from './TemplateTable'
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
  const analyzeBrandbook = useAnalyzeBrandbook()

  const [idea, setIdea] = useState<string | null>(null)
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
  const contentPack = useContentPack(files.length === 0 ? packId : null)
  const savedTopic = topicFromBrief(session.data?.brief)
  const ideaText = idea ?? savedTopic
  const patchPriority = useSetBrandPriority(brandbookId ?? '')
  const templateDetail = useTemplate(templateId)
  const dna = useDesignDna(templateId)
  const system = useMemo(() => (templateDetail.data ? buildDesignSystem(templateDetail.data, dna.data) : null), [templateDetail.data, dna.data])
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
    const text = ideaText.trim()
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
      { files: picked, idea: ideaText.trim() || undefined },
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
        onError: (err) => {
          setFiles(
            previous.map((file) =>
              file.name === name
                ? { ...file, kind, accepted: false, reason: errorText(err, 'Этот тип не подходит для файла') }
                : file,
            ),
          )
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

  const runBrandbookAnalysis = () => {
    if (!brandbookId || analyzeBrandbook.isPending) return
    analyzeBrandbook.mutate(
      { brandbookId, priority: priorityOverride ?? brandbookSummary.data?.priority ?? 'brandbook' },
      {
        onSuccess: (data) => {
          if (data?.assistant_note) setNote(data.assistant_note)
        },
        onError: () => {
          toast.show('Не удалось разобрать брендбук')
        },
      },
    )
  }

  const hasContent = Boolean(packId) || files.some(isContentFile) || Boolean(ideaText.trim())
  const canContinue = Boolean(templateId) && hasContent && !advancing
  const busy = upload.isPending || pendingFiles.length > 0 || advancing
  const analyzing = Boolean(templateId) && templateSummary.isPending
  const autopilotFailed = autopilotStarted && job.done && !session.data?.artifacts.generation_id
  const autopilotRunning = autopilotStarted && !autopilotFailed
  const assistantNote = autopilotFailed
    ? 'Сборка не запустилась — продолжим по шагам.'
    : (note ?? (templateSummary.data?.assistant_note || brandbookSummary.data?.assistant_note || session.data?.assistant_note || localNote({ files, templateId, hasContent, analyzing })))

  const goNext = () => {
    if (!canContinue) return
    const text = ideaText.trim()
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
      <StepShell title="Что у вас есть?" canvasLabel="Презентация" canvas={<PassportSkeleton />}>
        <ChoiceListSkeleton count={2} />
      </StepShell>
    )
  }

  if (project.isError || !project.data) {
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

  const uploadError = legacyError ?? (upload.error ? errorText(upload.error, 'Не удалось отправить файлы.') : null)
  const priorityValue = priorityOverride ?? brandbookSummary.data?.priority ?? 'brandbook'
  const hint = canContinue ? null : templateId ? 'Добавьте материалы или напишите, о чём презентация.' : 'Нужен шаблон в формате .pptx или .potx.'

  return (
    <StepShell
      title="Что у вас есть?"
      note={withoutColorCodes(assistantNote)}
      canvasLabel="Как будет выглядеть презентация"
      canvas={
        <TemplateTable
          summary={templateSummary.data ?? null}
          system={system}
          previews={templateSummary.data ? previewIds(templateSummary.data, dna.data) : []}
          aspectRatio={dna.data?.slide_size.aspect_ratio || 16 / 9}
          analyzing={analyzing}
          brandbook={brandbookSummary.data ?? null}
          priority={priorityValue}
          onOpenDetails={templateId ? () => setDnaOpen(true) : undefined}
          onDownload={dna.data ? () => downloadJson(dnaFileName(templateSummary.data?.filename ?? null), dna.data) : undefined}
          onAnalyzeBrandbook={brandbookId ? runBrandbookAnalysis : undefined}
          analyzingBrandbook={analyzeBrandbook.isPending}
          priorityControl={
            brandbookId ? (
              <Segmented
                label="Чьи цвета и шрифты важнее"
                value={priorityValue}
                onChange={(value) => changePriority(value as BrandPriority)}
                options={[
                  { value: 'brandbook', label: 'Брендбук' },
                  { value: 'template', label: 'Шаблон' },
                ]}
              />
            ) : null
          }
        />
      }
      inspector={
        dnaOpen
          ? {
              title: 'Правила шаблона',
              onClose: () => setDnaOpen(false),
              content: templateDetail.data ? <TemplateRules detail={templateDetail.data} dna={dna.data} /> : <DesignDnaSkeleton />,
            }
          : null
      }
      actions={
        <>
          <Button variant="primary" size="lg" pending={advancing} disabled={!canContinue || busy} onClick={goNext}>
            Дальше
          </Button>
          <Button variant="ghost" size="lg" pending={autopilotRunning} disabled={!canContinue || busy || autopilotRunning} onClick={runAutopilot}>
            Сделай сам
          </Button>
        </>
      }
    >
      <label className={styles.ideaLabel}>
        <span>О чём презентация</span>
        <textarea
          className={styles.idea}
          rows={3}
          value={ideaText}
          placeholder="Например, итоги продаж за год для совета директоров"
          onChange={(event) => setIdea(event.target.value)}
        />
      </label>
      <IntakeDropzone onFiles={sendFiles} disabled={busy} compact />
      {files.length === 0 && pendingFiles.length === 0 && (
        <ExistingRows
          files={existingFiles({
            template: templateSummary.data?.filename,
            brandbook: brandbookSummary.data?.name,
            datasets: contentPack.data?.datasets ?? [],
            sections: contentPack.data?.sections.length ?? 0,
          })}
        />
      )}
      {(files.length > 0 || pendingFiles.length > 0) && <FileRows files={files} pending={pendingFiles} onKind={changeKind} onRemove={removeFile} />}
      {uploadError && (
        <p className={styles.error} role="alert">
          {uploadError}
        </p>
      )}
      {hint && files.length > 0 && <p className={styles.hint}>{hint}</p>}
    </StepShell>
  )
}
