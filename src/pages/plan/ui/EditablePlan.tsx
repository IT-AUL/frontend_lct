import type { ReactNode } from 'react'
import { editSummary, useBuildFromPlan, usePlanDraft } from '@/features/edit-deck-plan'
import { DeckPlanView } from '@/widgets/deck-plan'
import type { DeckPlan, GenerationCreate, ResearchSource } from '@/entities/generation'
import { pluralize } from '@/shared/lib/format'
import { Button, PageHeader } from '@/shared/ui'
import styles from './PlanPage.module.css'
import { RebuildDialog } from './RebuildDialog'

interface EditablePlanProps {
  projectId: string
  draftKey: string
  basePlan: DeckPlan
  headings: ReadonlyMap<string, string>
  eyebrow: string
  buildLabel: string
  buildBody: Omit<GenerationCreate, 'deck_plan' | 'deck_plan_id'>
  notice: ReactNode
  toolbar?: ReactNode
  next?: ReactNode
  confirmDescription?: string
  intro?: ReactNode
  asideTop?: ReactNode
  sources?: readonly ResearchSource[]
  lockAll?: boolean
  description?: string
}

function describeEdits(base: DeckPlan, plan: DeckPlan): string {
  const { removed, added, renamed, moved } = editSummary(base, plan)
  const parts = [
    removed > 0 && `убрано ${removed} ${pluralize(removed, ['слайд', 'слайда', 'слайдов'])}`,
    added > 0 && `добавлено ${added}`,
    renamed > 0 && `переписано ${renamed}`,
    moved && 'изменён порядок',
  ].filter(Boolean)
  return parts.length > 0 ? `Ваши правки: ${parts.join(', ')}.` : ''
}

export function EditablePlan(props: EditablePlanProps) {
  const { projectId, draftKey, basePlan, headings, eyebrow, buildLabel, buildBody, notice, toolbar, next, confirmDescription, intro, asideTop, sources, lockAll = false, description } = props
  const draft = usePlanDraft(draftKey, basePlan)
  const { build, isPending } = useBuildFromPlan(projectId, draftKey)
  const untitled = draft.plan.slides.some((slide) => slide.title_intent.trim() === '')
  const buildDisabled = isPending || untitled
  const runBuild = () => build(buildBody, draft.plan, { lockAll })
  const quietRebuild = Boolean(next) && !draft.edited

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={eyebrow}
        title="План колоды"
        description={description ?? 'Поправьте порядок, заголовки, пункты и визуал — варианты соберутся по вашему плану.'}
        actions={
          <>
            <Button variant="secondary" size="lg" disabled={!draft.edited || isPending} onClick={draft.reset}>
              Сбросить правки
            </Button>
            {quietRebuild ? (
              <>
                <RebuildDialog
                  label="Пересобрать с теми же данными"
                  title="Пересобрать три варианта?"
                  description={confirmDescription ?? ''}
                  confirmLabel="Пересобрать"
                  disabled={buildDisabled}
                  pending={isPending}
                  onConfirm={runBuild}
                />
                {next}
              </>
            ) : (
              <Button variant="primary" size="lg" disabled={buildDisabled} onClick={runBuild}>
                {isPending ? 'Запускаем…' : buildLabel}
              </Button>
            )}
          </>
        }
      />
      {(notice || draft.edited || untitled) && (
        <div className={styles.banner} role="note">
          <div className={styles.bannerText}>
            {notice} {draft.edited && describeEdits(basePlan, draft.plan)}
            {untitled && ' У каждого слайда должен быть заголовок.'}
          </div>
        </div>
      )}
      {intro}
      {toolbar}
      <DeckPlanView
        sources={sources}
        asideTop={asideTop}
        plan={draft.plan}
        headings={headings}
        editor={{
          onMove: draft.move,
          onRemove: draft.remove,
          onUpdate: draft.update,
          onAdd: draft.add,
          onUnitChange: draft.updateUnit,
          onUnitAdd: draft.addUnit,
          onUnitRemove: draft.removeUnit,
          onUnitMove: draft.moveUnit,
        }}
      />
    </div>
  )
}
