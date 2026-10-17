import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAssistantSession, useRegenerateSlide, useSlideExplain, type RegenerateResult } from '@/entities/assistant'
import {
  buildIssueViews,
  clusterIssueViews,
  countOpenBySeverity,
  DEFAULT_VIEW_FILTER,
  dismissalEntry,
  filterIssueViews,
  groupIssueViews,
  isPendingStatus,
  issueGroupKey,
  reportOpenCounts,
  ruleMeta,
  selectableIds,
  SEVERITY,
  slideNumber,
  useAuditIssues,
  useVariantAudit,
  withSelection,
  type AuditIssue,
  type IssueView,
  type Severity,
} from '@/entities/audit'
import { useContentPack } from '@/entities/content-pack'
import { parseResearch, useGeneration } from '@/entities/generation'
import { usePassport } from '@/entities/passport'
import { markEvidence, useProject } from '@/entities/project'
import { FEATURE_PATHS, useCapabilities, useCapabilityFlag } from '@/entities/system'
import { useTemplate } from '@/entities/template'
import { orderVariants, slidePreviewUrl, useVariant, useVariants, useVariantSlides, type VariantSummary } from '@/entities/variant'
import { isStaleFile } from '@/features/export-deck'
import { useRepairSelected } from '@/features/repair-issues'
import { useIssueSelection } from '@/features/select-issues'
import { useVariantFiles } from '@/features/variant-files'
import {
  appendJournal,
  shouldIgnoreShortcut,
  SlideFilmstrip,
  useVariantJournal,
  type ClusteredGroup,
  type FilmstripSlide,
} from '@/widgets/audit-workspace'
import { SlideInspector, type InspectorMode } from '@/widgets/slide-inspector'
import { isApiError, isUnsupportedEndpoint } from '@/shared/api'
import { routes } from '@/shared/config'
import { Button, EmptyState, Skeleton, useToast } from '@/shared/ui'
import {
  buildExplainView,
  buildReworkChips,
  buildSlideNotesView,
  currentRevisionOf,
  defaultPolishVariant,
  findPlanSlide,
  findSlideAt,
  htmlExportSupported,
  openCriticalSummary,
  parseSlideParam,
  resolvePolishNote,
  withPassportMeta,
  type ReworkChip,
} from '../model/polishModel'
import { PassportDrawer } from './PassportDrawer'
import styles from './PolishPage.module.css'
import { PolishToolbar } from './PolishToolbar'
import { SlideAuditSection, type AuditScope } from './SlideAuditSection'
import { SlideExplainCard } from './SlideExplainCard'
import { SlideNotesBar } from './SlideNotesBar'
import { SlideReworkCard } from './SlideReworkCard'

const EMPTY_ISSUES: AuditIssue[] = []
const pad = (value: number) => String(value).padStart(2, '0')
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'неизвестная ошибка')
const onSlide = (view: IssueView, number: number) => view.issue.slide_index === number - 1

function worstSeverity(views: readonly IssueView[]): Severity | null {
  return views.reduce<Severity | null>((worst, view) => {
    if (!worst || SEVERITY[view.issue.severity].order < SEVERITY[worst].order) return view.issue.severity
    return worst
  }, null)
}

function PolishSkeleton() {
  return (
    <div className={styles.root} aria-busy="true" aria-label="Загружаю доводку">
      <div className={styles.assistantStrip}>
        <Skeleton style={{ width: '50%', height: 20 }} />
      </div>
      <div className={styles.toolbar}>
        <Skeleton style={{ width: 280, height: 28 }} />
        <Skeleton style={{ width: 320, height: 28 }} />
      </div>
      <div className={styles.workspace}>
        <div className={styles.skeletonStrip}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className={styles.skeletonThumb} delay={index * 0.05} />
          ))}
        </div>
        <div className={styles.centerStage}>
          <Skeleton className={styles.skeletonSlide} />
          <Skeleton style={{ height: 76, borderRadius: 12 }} />
        </div>
        <div className={styles.assistantPanel}>
          <Skeleton style={{ height: 120, borderRadius: 12 }} />
          <Skeleton style={{ height: 180, borderRadius: 12 }} delay={0.08} />
          <Skeleton style={{ height: 160, borderRadius: 12 }} delay={0.16} />
        </div>
      </div>
    </div>
  )
}

function DefaultVariantRedirect({ projectId, runId }: { projectId: string; runId: string }) {
  const { search } = useLocation()
  const variants = useVariants(runId)

  if (variants.isPending) return <PolishSkeleton />

  const target = variants.data ? defaultPolishVariant(variants.data) : null
  if (!target) {
    return (
      <div className={styles.center}>
        <EmptyState
          title={variants.isError ? 'Не удалось загрузить варианты' : 'У прогона нет вариантов'}
          description={variants.error?.message ?? 'Доводка откроется, когда будет готов хотя бы один вариант колоды.'}
          actions={
            <Link className={styles.auditLink} to={routes.variants(projectId, runId)}>
              К вариантам
            </Link>
          }
        />
      </div>
    )
  }

  return <Navigate replace to={{ pathname: routes.polish(projectId, runId, target.id), search }} />
}

interface PolishWorkspaceProps {
  projectId: string
  runId: string
  variantId: string
  slideParam: number | null
  onSlideChange: (slideNumber: number) => void
}

function PolishWorkspace({ projectId, runId, variantId, slideParam, onSlideChange }: PolishWorkspaceProps) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const toast = useToast()

  const sessionQuery = useAssistantSession(projectId)
  const variantsQuery = useVariants(runId)
  const variantQuery = useVariant(variantId)
  const slidesQuery = useVariantSlides(variantId)
  const generationQuery = useGeneration(runId)
  const projectQuery = useProject(projectId)
  const templateQuery = useTemplate(generationQuery.data?.template_id)
  const contentPackQuery = useContentPack(generationQuery.data?.content_pack_id)
  const capabilitiesQuery = useCapabilities()
  const renderPreviews = useCapabilityFlag(FEATURE_PATHS.pngPreviews)
  const variantFiles = useVariantFiles(variantId)
  const passportQuery = usePassport(variantFiles.passportArtifactId)
  const auditQuery = useVariantAudit(variantId)
  const audit = auditQuery.data
  const issuesQuery = useAuditIssues(audit?.id)
  const storedJournal = useVariantJournal(variantId)
  const regenerate = useRegenerateSlide(variantId)

  const [mode, setMode] = useState<InspectorMode>('slide')
  const [auditScope, setAuditScope] = useState<AuditScope>('slide')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [groupOverrides, setGroupOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [passportOpen, setPassportOpen] = useState(false)
  const [regeneratedMap, setRegeneratedMap] = useState<ReadonlyMap<string, RegenerateResult>>(() => new Map())
  const [chartOverrideMap, setChartOverrideMap] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [pendingChipKey, setPendingChipKey] = useState<string | null>(null)
  const [regeneratingSlide, setRegeneratingSlide] = useState<number | null>(null)
  const [reworkUnsupported, setReworkUnsupported] = useState(false)
  const [reworkError, setReworkError] = useState<string | null>(null)
  const [chipRejections, setChipRejections] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [framesVisible, setFramesVisible] = useState(true)
  const [actionNote, setActionNote] = useState<string | null>(null)

  const variants = useMemo(() => orderVariants(variantsQuery.data ?? []), [variantsQuery.data])
  const fallbackVariant: VariantSummary = useMemo(
    () =>
      variants.find((item) => item.id === variantId) ??
      variantQuery.data ?? {
        id: variantId,
        run_id: runId,
        strategy: 'balanced',
        status: 'completed',
        rationale: null,
        deck_artifact_id: null,
        montage_artifact_id: null,
        metrics: null,
        audit_status: 'completed',
        export_ids: [],
        planner: null,
        contextual_issues: null,
        deck_plan_id: null,
      },
    [variants, variantId, variantQuery.data, runId],
  )

  const highestRegenRevision = useMemo(() => {
    let max: number | null = null
    for (const item of regeneratedMap.values()) {
      if (typeof item.deck_revision === 'number') max = Math.max(max ?? 0, item.deck_revision)
    }
    return max
  }, [regeneratedMap])

  const files = variantFiles.files
  const revision = currentRevisionOf(audit?.deck_revision, [files?.pdf ?? null, files?.quality_passport ?? null], highestRegenRevision)
  const journal = useMemo(() => storedJournal.entries.filter((entry) => entry.revision <= revision), [storedJournal.entries, revision])
  const batches = useMemo(() => storedJournal.batches.filter((batch) => batch.revision <= revision), [storedJournal.batches, revision])

  const rawIssues = issuesQuery.data ?? EMPTY_ISSUES
  const baseViews = useMemo(() => buildIssueViews(rawIssues, journal), [rawIssues, journal])
  const selection = useIssueSelection(selectableIds(baseViews))
  const views = useMemo(() => withSelection(baseViews, selection.selectedIds), [baseViews, selection.selectedIds])
  const pendingViews = useMemo(() => views.filter((view) => isPendingStatus(view.status)), [views])

  const repair = useRepairSelected({
    projectId,
    variantId,
    auditId: audit?.id,
    fromRevision: revision,
  })

  const slideInfos = slidesQuery.data ?? []
  const plan = generationQuery.data?.deck_plan ?? null
  const lastIssueSlide = rawIssues.reduce((max, issue) => Math.max(max, slideNumber(issue) ?? 0), 0)
  const slideCount = Math.max(slideInfos.length, plan?.slides.length ?? 0, lastIssueSlide, 1)
  const firstTroubled = pendingViews.map((view) => slideNumber(view.issue)).find((number): number is number => number !== null)
  const currentSlide = Math.min(Math.max(slideParam ?? firstTroubled ?? 1, 1), slideCount)

  const slideAt = (number: number) => findSlideAt(slideInfos, number, regeneratedMap)
  const currentSlideInfo = slideAt(currentSlide)
  const currentPlanSlide = findPlanSlide(plan, currentSlideInfo, currentSlide)
  const currentRegen = currentSlideInfo ? regeneratedMap.get(currentSlideInfo.id) : undefined
  const titleOf = (number: number) => slideAt(number)?.title ?? findPlanSlide(plan, slideAt(number), number)?.title_intent ?? undefined

  const explainQuery = useSlideExplain(currentSlideInfo?.id)
  const rawExplain = explainQuery.data
  const chartOverride = currentSlideInfo ? chartOverrideMap.get(currentSlideInfo.id) : undefined
  const effectiveExplain = useMemo(() => {
    if (!rawExplain || !chartOverride) return rawExplain
    return {
      ...rawExplain,
      chosen: {
        type: chartOverride,
        reasons: rawExplain.chosen?.reasons ?? [],
      },
    }
  }, [rawExplain, chartOverride])

  const explainView = useMemo(
    () => buildExplainView(effectiveExplain, currentPlanSlide, currentSlideInfo, currentRegen?.exemplar),
    [effectiveExplain, currentPlanSlide, currentSlideInfo, currentRegen?.exemplar],
  )
  const reworkChips = useMemo(
    () => buildReworkChips(fallbackVariant.strategy, explainView.alternatives, explainView.hasChart),
    [fallbackVariant.strategy, explainView.alternatives, explainView.hasChart],
  )

  const headings = useMemo(() => {
    const map = new Map<string, string>()
    for (const section of contentPackQuery.data?.sections ?? []) {
      map.set(section.id, section.heading)
    }
    return map
  }, [contentPackQuery.data?.sections])

  const researchSources = useMemo(() => {
    const raw = (generationQuery.data?.deck_plan as unknown as Record<string, unknown> | undefined)?.research
    return parseResearch(raw)?.sources ?? []
  }, [generationQuery.data?.deck_plan])

  const notesView = useMemo(
    () => buildSlideNotesView(currentPlanSlide, explainView, headings, researchSources),
    [currentPlanSlide, explainView, headings, researchSources],
  )

  const slidePendingViews = useMemo(() => pendingViews.filter((view) => onSlide(view, currentSlide)), [pendingViews, currentSlide])
  const scopedViews = useMemo(() => {
    const filtered = filterIssueViews(views, DEFAULT_VIEW_FILTER)
    return auditScope === 'slide' ? filtered.filter((view) => onSlide(view, currentSlide)) : filtered
  }, [views, auditScope, currentSlide])

  const groups: ClusteredGroup[] = groupIssueViews(scopedViews, 'rule', titleOf).map((group) => ({
    ...group,
    clusters: clusterIssueViews(group.views),
  }))
  const clusters = groups.flatMap((group) => group.clusters)
  const effectiveActive = views.some((view) => view.key === activeKey) ? activeKey : null
  const activeCluster = effectiveActive ? clusters.find((cluster) => cluster.views.some((view) => view.key === effectiveActive)) : undefined
  const linkedKeys = activeCluster ? activeCluster.views.map((view) => view.key) : []

  const isGroupExpanded = (groupKey: string) => groupOverrides.get(groupKey) ?? true
  const expandedGroups = new Set(groups.filter((group) => isGroupExpanded(group.key)).map((group) => group.key))

  const severityCounts = useMemo(() => countOpenBySeverity(views), [views])
  const openCritical = openCriticalSummary(issuesQuery.data, audit)
  const auditLoaded = Boolean(audit) && issuesQuery.isSuccess
  const auditUnavailable =
    (auditQuery.isError && isUnsupportedEndpoint(auditQuery.error)) ||
    (issuesQuery.isError && isUnsupportedEndpoint(issuesQuery.error))
  const auditHardError = (auditQuery.isError || issuesQuery.isError) && !auditUnavailable

  useEffect(() => {
    if (auditLoaded) {
      reportOpenCounts(projectId, { blocker: severityCounts.blocker, error: severityCounts.error }, runId)
    }
  }, [auditLoaded, projectId, runId, severityCounts.blocker, severityCounts.error])

  const filmstrip: FilmstripSlide[] = Array.from({ length: slideCount }, (_, index) => {
    const number = index + 1
    const open = pendingViews.filter((view) => onSlide(view, number))
    const info = slideAt(number)
    return {
      number,
      title: titleOf(number),
      imageUrl: slidePreviewUrl(info, renderPreviews),
      openCount: open.length,
      worst: worstSeverity(open),
    }
  })

  const stageViews = useMemo(
    () => filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, status: 'all' }).filter((view) => onSlide(view, currentSlide)),
    [views, currentSlide],
  )
  const stageJournal = useMemo(
    () => journal.filter((entry) => entry.issue.slide_index === currentSlide - 1),
    [journal, currentSlide],
  )

  const fixableInScope = useMemo(
    () => scopedViews.filter((view) => view.selectable).map((view) => view.issue),
    [scopedViews],
  )
  const selectedIssues = useMemo(
    () => scopedViews.filter((view) => view.status === 'selected').map((view) => view.issue),
    [scopedViews],
  )

  const pickSlide = (number: number) => {
    const next = Math.min(Math.max(number, 1), slideCount)
    onSlideChange(next)
    setActiveKey(null)
    setReworkError(null)
  }

  const activateIssue = (key: string) => {
    const view = views.find((candidate) => candidate.key === key)
    setActiveKey((current) => (current === key ? null : key))
    if (!view) return
    const groupKey = issueGroupKey(view.issue, 'rule')
    setGroupOverrides((current) => new Map(current).set(groupKey, true))
    const number = slideNumber(view.issue)
    if (number && number !== currentSlide) onSlideChange(number)
  }

  const runRepair = async (targets: readonly AuditIssue[]) => {
    if (targets.length === 0 || repair.isPending || !audit) return
    try {
      const result = await repair.run(targets)
      appendJournal(variantId, result.entries, result.batch)
      selection.clear()
      const freshCounts = countOpenBySeverity(buildIssueViews(result.reaudit, [...journal, ...result.entries]))
      if (freshCounts.blocker === 0 && result.batch.revision > 1) markEvidence(projectId, 'reaudited')
      const noteText =
        freshCounts.blocker === 0
          ? 'Исправил выбранные замечания и перепроверил слайды: блокеров 0, колода готова к выступлению.'
          : `Ревизия r${result.batch.revision}: исправлено ${result.batch.fixed} из ${targets.length}.`
      setActionNote(noteText)
      toast.show(`Ревизия r${result.batch.revision}: исправлено ${result.batch.fixed}`)
    } catch (error) {
      toast.show(`Не удалось применить правки: ${errorText(error)}`)
    }
  }

  const runRework = async (chip: ReworkChip) => {
    if (pendingChipKey !== null) return
    const targetSlideId = currentSlideInfo?.id ?? currentPlanSlide?.id ?? `slide-${currentSlide - 1}`
    setPendingChipKey(chip.key)
    setRegeneratingSlide(currentSlide)
    setReworkError(null)
    try {
      const result = await regenerate.mutateAsync({
        slideId: targetSlideId,
        action: chip.action,
        ...(chip.chartType ? { chart_type: chip.chartType } : {}),
      })
      if (!result) {
        setReworkUnsupported(true)
        setActionNote('Точечная пересборка одного слайда не поддерживается на этом сервере.')
        return
      }
      setRegeneratedMap((current) => {
        const next = new Map(current)
        next.set(targetSlideId, result)
        if (result.slide?.id) next.set(result.slide.id, result)
        return next
      })
      if (chip.chartType) {
        setChartOverrideMap((current) => new Map(current).set(targetSlideId, chip.chartType as string))
      }
      const fallbackNote =
        chip.action === 'shorter'
          ? 'Сделал слайд короче.'
          : chip.action === 'other_layout'
            ? 'Поменял раскладку слайда.'
            : chip.action === 'other_chart'
              ? 'Поменял график на слайде.'
              : 'Пересобрал слайд в выбранном стиле.'
      const noteText = result.assistant_note ?? fallbackNote
      setActionNote(noteText)
      toast.show(`${noteText} (слайд ${pad(currentSlide)})`)
    } catch (error) {
      const message = errorText(error)
      if (isApiError(error) && error.status === 422) {
        setChipRejections((current) => new Map(current).set(chip.key, message))
        toast.show(`${chip.label}: ${message}`)
      } else {
        setReworkError(message)
        toast.show(`Не удалось переделать слайд: ${message}`)
      }
    } finally {
      setPendingChipKey(null)
      setRegeneratingSlide(null)
    }
  }

  const handlePickAlternative = (chartType: string) => {
    const label = explainView.alternatives.find((alt) => alt.type === chartType)?.label ?? chartType
    void runRework({
      key: `other_chart:${chartType}`,
      action: 'other_chart',
      chartType,
      label: `График: ${label}`,
      title: `Построить «${label}»`,
    })
  }

  const handleDismissed = (dismissed: readonly AuditIssue[], reason: string) => {
    if (dismissed.length === 0) return
    appendJournal(
      variantId,
      dismissed.map((issue) => dismissalEntry(issue, reason, revision)),
    )
    const name = ruleMeta((dismissed[0] as AuditIssue).rule_code).name
    toast.show(`Отклонено: ${name}${dismissed.length > 1 ? ` ×${dismissed.length}` : ''}`)
  }

  const stepIssue = (delta: 1 | -1) => {
    if (clusters.length === 0) return
    const index = clusters.findIndex((cluster) => cluster.views.some((view) => view.key === effectiveActive))
    const nextIndex = index === -1 ? (delta === 1 ? 0 : clusters.length - 1) : Math.min(Math.max(index + delta, 0), clusters.length - 1)
    const next = clusters[nextIndex]
    if (next) activateIssue(next.key)
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreShortcut(event)) return
    const actions: Record<string, () => void> = {
      ArrowRight: () => pickSlide(currentSlide + 1),
      ArrowLeft: () => pickSlide(currentSlide - 1),
      ArrowDown: () => pickSlide(currentSlide + 1),
      ArrowUp: () => pickSlide(currentSlide - 1),
      j: () => stepIssue(1),
      k: () => stepIssue(-1),
      b: () => setFramesVisible((current) => !current),
      r: () => {
        if (fixableInScope.length > 0) void runRepair(fixableInScope)
      },
      Escape: () => setActiveKey(null),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const initialLoading =
    slidesQuery.isPending &&
    variantsQuery.isPending &&
    generationQuery.isPending &&
    !slidesQuery.data &&
    !generationQuery.data

  if (initialLoading) return <PolishSkeleton />

  if (auditHardError && !slidesQuery.data && !generationQuery.data) {
    return (
      <div className={styles.center}>
        <EmptyState
          title="Не удалось загрузить данные доводки"
          description={errorText(auditQuery.error ?? issuesQuery.error)}
          actions={
            <Button variant="primary" onClick={() => void (audit ? issuesQuery.refetch() : auditQuery.refetch())}>
              Повторить
            </Button>
          }
        />
      </div>
    )
  }

  const passport = passportQuery.data ?? null
  const passportStale = isStaleFile(files?.quality_passport ?? null, revision)
  const basePptx = files?.pptx ?? (currentRegen?.deck_artifact_id
    ? {
        format: 'pptx' as const,
        artifactId: currentRegen.deck_artifact_id,
        exportId: null,
        deckRevision: currentRegen.deck_revision ?? revision,
        sizeBytes: null,
        sha256: null,
        mimeType: null,
      }
    : null)
  const pptxFile = withPassportMeta(basePptx, passport, Boolean(passport) && !passportStale)
  const htmlSupported = htmlExportSupported(capabilitiesQuery.data)
  const auditHref = `${routes.audit(projectId, runId, variantId)}${search}`
  const exportHref = routes.export(projectId, runId, variantId)

  const note = resolvePolishNote({
    currentSlide,
    regeneratingSlideNumber: regeneratingSlide,
    repairPending: repair.isPending,
    autopilotPending: false,
    actionNote,
    explainNote: effectiveExplain?.assistant_note ?? null,
    hasChart: explainView.hasChart,
    sessionNote: sessionQuery.data?.assistant_note ?? null,
    slideOpenIssues: slidePendingViews.length,
    totalOpenIssues: pendingViews.length,
  })

  const currentImageUrl = slidePreviewUrl(currentSlideInfo, renderPreviews)
  const currentImageRevision = currentSlideInfo?.revision ?? null
  const slideTargetCount = plan?.brief?.target_slide_count ?? projectQuery.data?.target_slide_count ?? slideCount

  return (
    <div className={styles.root}>
      <PolishToolbar
        projectId={projectId}
        variant={fallbackVariant}
        variants={variants.length > 0 ? variants : [fallbackVariant]}
        onVariantChange={(nextVariantId) => navigate({ pathname: routes.polish(projectId, runId, nextVariantId), search })}
        revision={revision}
        openBlockers={openCritical?.blockers ?? (auditUnavailable ? 0 : null)}
        openErrors={openCritical?.errors ?? null}
        files={files}
        pptxFile={pptxFile}
        filesPending={variantFiles.isPending && !pptxFile}
        htmlSupported={htmlSupported}
        auditHref={auditHref}
        exportHref={exportHref}
        note={note}
        onOpenPassport={() => {
          setPassportOpen(true)
          setActionNote('Проверил выходной PPTX повторным открытием: все слайды, таблицы и графики собраны родными объектами PowerPoint.')
        }}
      />

      <div className={styles.workspace}>
        <SlideFilmstrip slides={filmstrip} current={currentSlide} pdfUrl={variantFiles.pdfUrl} regenerating={regeneratingSlide} onPick={pickSlide} />

        <div className={styles.centerStage}>
          <SlideInspector
            pdfUrl={variantFiles.pdfUrl}
            pdfRevision={files?.pdf?.deckRevision ?? null}
            imageUrl={currentImageUrl}
            imageRevision={currentImageRevision}
            revision={revision}
            slideNumber={currentSlide}
            slideCount={slideCount}
            title={titleOf(currentSlide)}
            views={stageViews}
            journal={stageJournal}
            activeKey={effectiveActive}
            linkedKeys={linkedKeys}
            hoverKey={hoverKey}
            mode={mode}
            regenerating={regeneratingSlide === currentSlide}
            exemplarLabel={explainView.exemplarLabel}
            showFrames={framesVisible}
            onShowFramesChange={setFramesVisible}
            onModeChange={setMode}
            onPick={activateIssue}
            onHover={setHoverKey}
            onSlideChange={pickSlide}
          />

          <SlideNotesBar slideNumber={currentSlide} view={notesView} sourceNote={explainView.sourceText} />
        </div>

        <aside aria-label="Панель помощника" className={styles.assistantPanel}>
          <SlideReworkCard
            slideNumber={currentSlide}
            chips={reworkChips}
            pendingKey={pendingChipKey}
            disabled={false}
            disabledReasons={chipRejections}
            unsupported={reworkUnsupported}
            error={reworkError}
            exemplarLabel={explainView.exemplarLabel}
            onSelectChip={(chip) => void runRework(chip)}
          />

          <SlideExplainCard
            view={explainView}
            isPending={explainQuery.isPending && Boolean(currentSlideInfo?.id)}
            reworkPending={pendingChipKey !== null}
            onPickAlternative={handlePickAlternative}
          />

          <SlideAuditSection
            slideNumber={currentSlide}
            scope={auditScope}
            onScopeChange={setAuditScope}
            slideOpenCount={slidePendingViews.length}
            totalOpenCount={pendingViews.length}
            journalCount={journal.length}
            groups={groups}
            expanded={expandedGroups}
            onToggleGroup={(groupKey) => setGroupOverrides((current) => new Map(current).set(groupKey, !isGroupExpanded(groupKey)))}
            selectedIds={selection.selectedIds}
            activeKey={effectiveActive}
            hoverKey={hoverKey}
            auditId={audit?.id}
            auditPending={(auditQuery.isPending || issuesQuery.isPending) && !auditUnavailable}
            auditUnavailable={auditUnavailable}
            repairPending={repair.isPending}
            fixableIssues={fixableInScope}
            selectedIssues={selectedIssues}
            journal={journal}
            batches={batches}
            auditHref={auditHref}
            onActivate={activateIssue}
            onHover={setHoverKey}
            onSelect={selection.setMany}
            onRepair={(targets) => void runRepair(targets)}
            onDismissed={handleDismissed}
          />
        </aside>
      </div>

      <PassportDrawer
        open={passportOpen}
        onOpenChange={setPassportOpen}
        projectId={projectId}
        variant={fallbackVariant}
        files={files}
        passportArtifactId={variantFiles.passportArtifactId}
        currentRevision={revision}
        templateFile={templateQuery.data?.filename ?? null}
        slideCount={slideTargetCount}
      />
    </div>
  )
}

export function PolishPage() {
  const { projectId = '', runId = '', variantId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  if (!variantId) return <DefaultVariantRedirect projectId={projectId} runId={runId} />

  const changeSlide = (slideNumber: number) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('slide', String(slideNumber))
        return next
      },
      { replace: true },
    )

  return (
    <PolishWorkspace
      key={variantId}
      projectId={projectId}
      runId={runId}
      variantId={variantId}
      slideParam={parseSlideParam(searchParams.get('slide'))}
      onSlideChange={changeSlide}
    />
  )
}
