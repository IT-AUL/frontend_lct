import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  auditIssuesQuery,
  buildIssueViews,
  checkKind,
  countByCategory,
  countOpenCritical,
  DEFAULT_VIEW_FILTER,
  dismissalEntry,
  filterIssueViews,
  groupIssueViews,
  isPendingStatus,
  ruleMeta,
  selectableIds,
  SEVERITY,
  slideNumber,
  useAuditIssues,
  useContextualAudit,
  useVariantAudit,
  withSelection,
  type AuditIssue,
  type IssueGrouping,
  type IssueView,
  type IssueViewFilter,
  type JournalEntry,
  type RuleCategory,
  type Severity,
} from '@/entities/audit'
import { markEvidence } from '@/entities/project'
import { useActiveProviderSession } from '@/entities/provider-session'
import { FEATURE_PATHS, useCapabilityFlag } from '@/entities/system'
import { orderVariants, slidePreviewUrl, useVariants, useVariantSlides } from '@/entities/variant'
import { RepairBar, selectionKey, useRepairPreview, useRepairSelected } from '@/features/repair-issues'
import { useIssueSelection } from '@/features/select-issues'
import { useVariantFiles } from '@/features/variant-files'
import { routes } from '@/shared/config'
import { Button, EmptyState, Skeleton, useToast } from '@/shared/ui'
import { appendJournal, useVariantJournal } from '../model/journalStore'
import { AuditSummary, PolicyStrip } from './AuditSummary'
import { IssueFilters } from './IssueFilters'
import { IssueList } from './IssueList'
import { IssuePanel, type PanelTab } from './IssuePanel'
import { JournalList } from './JournalList'
import { ReauditBanner } from './ReauditBanner'
import { SlideFilmstrip, type FilmstripSlide } from './SlideFilmstrip'
import styles from './AuditWorkspace.module.css'

export type StageMode = 'slide' | 'compare'

export interface AuditStageProps {
  pdfUrl: string | null
  pdfRevision: number | null
  imageUrl: string | null
  imageRevision: number | null
  revision: number
  slideNumber: number
  slideCount: number
  title: string | undefined
  views: readonly IssueView[]
  journal: readonly JournalEntry[]
  activeKey: string | null
  hoverKey: string | null
  mode: StageMode
  onModeChange: (mode: StageMode) => void
  onPick: (key: string) => void
  onHover: (key: string | null) => void
  onSlideChange: (slideNumber: number) => void
}

interface AuditWorkspaceProps {
  projectId: string
  runId: string
  variantId: string
  slide: number | null
  onSlideChange: (slideNumber: number) => void
  renderStage: (stage: AuditStageProps) => ReactNode
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'неизвестная ошибка')

const onSlide = (view: IssueView, number: number) => view.issue.slide_index === number - 1

function worstSeverity(views: readonly IssueView[]): Severity | null {
  return views.reduce<Severity | null>((worst, view) => {
    if (!worst || SEVERITY[view.issue.severity].order < SEVERITY[worst].order) return view.issue.severity
    return worst
  }, null)
}

export function AuditWorkspace({ projectId, runId, variantId, slide, onSlideChange, renderStage }: AuditWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const session = useActiveProviderSession()
  const files = useVariantFiles(variantId)
  const variantsQuery = useVariants(runId)
  const auditQuery = useVariantAudit(variantId)
  const audit = auditQuery.data
  const issuesQuery = useAuditIssues(audit?.id)
  const slidesQuery = useVariantSlides(variantId)
  const contextual = useContextualAudit(variantId)
  const stored = useVariantJournal(variantId)

  const [filter, setFilter] = useState<IssueViewFilter>(DEFAULT_VIEW_FILTER)
  const [grouping, setGrouping] = useState<IssueGrouping>('slide')
  const [tab, setTab] = useState<PanelTab>('issues')
  const [mode, setMode] = useState<StageMode>('slide')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [reaudited, setReaudited] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(true)
  const [reauditPending, setReauditPending] = useState(false)

  const revision = audit?.deck_revision ?? 1
  const journal = stored.entries.filter((entry) => entry.revision <= revision)
  const batches = stored.batches.filter((batch) => batch.revision <= revision)
  const issues = issuesQuery.data ?? []
  const baseViews = buildIssueViews(issues, journal)
  const selection = useIssueSelection(selectableIds(baseViews))
  const dryRunAvailable = useCapabilityFlag(FEATURE_PATHS.repairDryRun)
  const repairPreview = useRepairPreview(audit?.id)
  const views = withSelection(baseViews, selection.selectedIds)
  const selectedIssues = views.filter((view) => view.status === 'selected').map((view) => view.issue)

  const repair = useRepairSelected({
    projectId,
    variantId,
    auditId: audit?.id,
    fromRevision: revision,
  })

  const slideInfos = slidesQuery.data ?? []
  const lastIssueSlide = issues.reduce((max, issue) => Math.max(max, slideNumber(issue) ?? 0), 0)
  const slideCount = Math.max(slideInfos.length, lastIssueSlide, 1)
  const slideAt = (number: number) => slideInfos.find((info) => info.index === number - 1)
  const titleOf = (number: number) => slideAt(number)?.title ?? undefined

  const pending = views.filter((view) => isPendingStatus(view.status))
  const firstTroubled = pending.map((view) => slideNumber(view.issue)).find((number): number is number => number !== null)
  const currentSlide = Math.min(Math.max(slide ?? firstTroubled ?? 1, 1), slideCount)

  const filtered = filterIssueViews(views, filter)
  const groups = groupIssueViews(filtered, grouping, titleOf)
  const flat = groups.flatMap((group) => group.views)
  const statusScoped = filterIssueViews(views, { ...DEFAULT_VIEW_FILTER, status: filter.status })
  const effectiveActive = views.some((view) => view.key === activeKey) ? activeKey : null

  const severityCounts: Record<Severity, number> = { blocker: 0, error: 0, warning: 0, info: 0 }
  for (const view of pending) severityCounts[view.issue.severity] += 1
  const kindCounts = {
    D: pending.filter((view) => checkKind(view.issue) === 'D').length,
    N: pending.filter((view) => checkKind(view.issue) === 'N').length,
  }
  const openCritical = countOpenCritical(views)
  const stats = {
    fixed: views.filter((view) => view.status === 'fixed').length,
    dismissed: views.filter((view) => view.status === 'dismissed').length,
    failed: views.filter((view) => view.status === 'unresolved').length,
  }

  const filmstrip: FilmstripSlide[] = Array.from({ length: slideCount }, (_, index) => {
    const number = index + 1
    const open = pending.filter((view) => onSlide(view, number))
    return { number, title: titleOf(number), imageUrl: slidePreviewUrl(slideAt(number)), openCount: open.length, worst: worstSeverity(open) }
  })

  const stageViews = filterIssueViews(views, { ...filter, status: 'all' }).filter((view) => onSlide(view, currentSlide))
  const stageJournal = journal.filter((entry) => entry.issue.slide_index === currentSlide - 1)
  const exportHref = routes.export(projectId, runId, variantId)

  const activate = (key: string, toggle = false) => {
    if (toggle && key === effectiveActive) {
      setActiveKey(null)
      return
    }
    const view = views.find((candidate) => candidate.key === key)
    setActiveKey(key)
    setTab('issues')
    if (view && !flat.includes(view)) setFilter((current) => ({ ...current, status: 'all' }))
    const number = view ? slideNumber(view.issue) : null
    if (number && number !== currentSlide) onSlideChange(number)
  }

  const pickSlide = (number: number) => {
    const next = Math.min(Math.max(number, 1), slideCount)
    onSlideChange(next)
    setActiveKey(flat.find((view) => onSlide(view, next))?.key ?? null)
  }

  const stepIssue = (delta: 1 | -1) => {
    if (flat.length === 0) return
    const index = flat.findIndex((view) => view.key === effectiveActive)
    const nextIndex = index === -1 ? (delta === 1 ? 0 : flat.length - 1) : Math.min(Math.max(index + delta, 0), flat.length - 1)
    const next = flat[nextIndex]
    if (next) activate(next.key)
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    const actions: Record<string, () => void> = {
      j: () => stepIssue(1),
      ArrowDown: () => stepIssue(1),
      k: () => stepIssue(-1),
      ArrowUp: () => stepIssue(-1),
      ArrowRight: () => pickSlide(currentSlide + 1),
      ArrowLeft: () => pickSlide(currentSlide - 1),
      x: () => {
        const view = views.find((candidate) => candidate.key === effectiveActive)
        if (view?.selectable) selection.toggle(view.issue.id)
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

  const settleReaudit = (fresh: readonly AuditIssue[], entries: readonly JournalEntry[]) => {
    setReaudited(true)
    setBannerOpen(true)
    if (countOpenCritical(buildIssueViews(fresh, entries)) === 0) markEvidence(projectId, 'reaudited')
  }

  const runRepair = async (targets: readonly AuditIssue[]) => {
    if (targets.length === 0 || repair.isPending) return
    try {
      const result = await repair.run(targets)
      appendJournal(variantId, result.entries, result.batch)
      selection.clear()
      setTab('journal')
      settleReaudit(result.reaudit, [...journal, ...result.entries])
      const { fixed, unresolved } = result.batch
      toast.show(`Ревизия r${result.batch.revision}: исправлено ${fixed}${unresolved > 0 ? `, не удалось ${unresolved}` : ''}`)
    } catch (error) {
      toast.show(`Не удалось применить правки: ${errorText(error)}`)
    }
  }

  const runReaudit = async () => {
    setReauditPending(true)
    try {
      const { data: fresh } = await auditQuery.refetch({ throwOnError: true })
      const freshIssues = fresh ? await queryClient.fetchQuery({ ...auditIssuesQuery(fresh.id), staleTime: 0 }) : []
      settleReaudit(freshIssues, journal)
    } catch (error) {
      toast.show(`Повторный аудит не удался: ${errorText(error)}`)
    } finally {
      setReauditPending(false)
    }
  }

  const runContextual = () => {
    if (!session) {
      toast.show('Для смысловых проверок подключите модель — кнопка «Модели» в шапке.')
      return
    }
    if (audit?.contextual_status === 'completed') {
      toast.show('Контекстные проверки для этой ревизии уже выполнены')
      return
    }
    contextual.mutate(session.id, {
      onSuccess: (run) =>
        toast.show(run.contextual_status === 'completed' ? 'Модель проверила смысл слайдов' : `Контекстные проверки: ${run.contextual_status}`),
      onError: (error) => toast.show(`Модель не ответила: ${errorText(error)}`),
    })
  }

  const onDismissed = (issue: AuditIssue, reason: string) => {
    appendJournal(variantId, [dismissalEntry(issue, reason, revision)])
    toast.show(`Отклонено: ${ruleMeta(issue.rule_code).name}`)
  }

  const toggleCategory = (category: RuleCategory) => {
    setFilter((current) => ({ ...current, category: current.category === category ? 'all' : category }))
    setTab('issues')
  }

  if (auditQuery.isError || issuesQuery.isError) {
    return (
      <div className={styles.center}>
        <EmptyState
          title="Не удалось загрузить аудит"
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

  if (!audit || issuesQuery.isPending) return <WorkspaceSkeleton />

  return (
    <div className={styles.root}>
      <AuditSummary
        variants={orderVariants(variantsQuery.data ?? [])}
        variantId={variantId}
        onVariantChange={(id) => navigate(routes.audit(projectId, runId, id))}
        audit={audit}
        severityCounts={severityCounts}
        kindCounts={kindCounts}
        fixableCount={selectableIds(views).length}
        hasProvider={Boolean(session)}
        contextualPending={contextual.isPending}
        onRunContextual={runContextual}
        reauditPending={reauditPending}
        onReaudit={() => void runReaudit()}
        exportHref={exportHref}
      />
      <PolicyStrip counts={countByCategory(views)} audit={audit} active={filter.category} onToggle={toggleCategory} />
      {reaudited && bannerOpen && (
        <ReauditBanner revision={revision} openCritical={openCritical} stats={stats} exportHref={exportHref} onClose={() => setBannerOpen(false)} />
      )}
      <div className={styles.grid}>
        <SlideFilmstrip slides={filmstrip} current={currentSlide} pdfUrl={files.pdfUrl} onPick={pickSlide} />
        <div className={styles.stage}>
          {renderStage({
            pdfUrl: files.pdfUrl,
            pdfRevision: files.files?.pdf?.deckRevision ?? null,
            imageUrl: slidePreviewUrl(slideAt(currentSlide)),
            imageRevision: slideAt(currentSlide)?.revision ?? null,
            revision,
            slideNumber: currentSlide,
            slideCount,
            title: titleOf(currentSlide),
            views: stageViews,
            journal: stageJournal,
            activeKey: effectiveActive,
            hoverKey,
            mode,
            onModeChange: setMode,
            onPick: (key) => activate(key),
            onHover: setHoverKey,
            onSlideChange: pickSlide,
          })}
        </div>
        <IssuePanel
          tab={tab}
          onTabChange={setTab}
          openCount={pending.length}
          journalCount={journal.length}
          issues={
            <>
              <IssueFilters
                filter={filter}
                onFilterChange={setFilter}
                grouping={grouping}
                onGroupingChange={setGrouping}
                counts={{
                  all: statusScoped.length,
                  D: statusScoped.filter((view) => checkKind(view.issue) === 'D').length,
                  N: statusScoped.filter((view) => checkKind(view.issue) === 'N').length,
                }}
              />
              <IssueList
                groups={groups}
                activeKey={effectiveActive}
                hoverKey={hoverKey}
                auditId={audit.id}
                repairPending={repair.isPending}
                onActivate={(key) => activate(key, true)}
                onHover={setHoverKey}
                onToggleSelect={selection.toggle}
                onRepairOne={(issue) => void runRepair([issue])}
                onDismissed={onDismissed}
              />
              <RepairBar
                selectedCount={selection.count}
                fixableCount={selectableIds(views).length}
                pending={repair.isPending}
                onSelectAll={selection.selectAll}
                onClear={selection.clear}
                onRepair={() => void runRepair(selectedIssues)}
                onPreview={dryRunAvailable ? () => repairPreview.mutate(selectedIssues, { onError: (error) => toast.show(error.message) }) : undefined}
                previewPending={repairPreview.isPending}
                preview={repairPreview.data && repairPreview.data.key === selectionKey(selectedIssues) ? repairPreview.data : null}
                onClosePreview={repairPreview.reset}
              />
            </>
          }
          journal={<JournalList entries={journal} batches={batches} />}
        />
      </div>
    </div>
  )
}

function WorkspaceSkeleton() {
  return (
    <div className={styles.root} aria-busy="true" aria-label="Загружаю аудит">
      <div className={styles.skeletonBar}>
        <Skeleton className={styles.skeletonBlock} />
      </div>
      <div className={styles.grid}>
        <div className={styles.skeletonStrip}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className={styles.skeletonThumb} delay={index * 0.08} />
          ))}
        </div>
        <div className={styles.stage}>
          <Skeleton className={styles.skeletonSlide} />
        </div>
        <div className={styles.skeletonPanel}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={styles.skeletonCard} delay={index * 0.08} />
          ))}
        </div>
      </div>
    </div>
  )
}
