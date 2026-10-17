import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { useGeneration } from '@/entities/generation'
import { useTemplate } from '@/entities/template'
import { useVariant, useVariants } from '@/entities/variant'
import { AuditWorkspace } from '@/widgets/audit-workspace'
import { SlideInspector } from '@/widgets/slide-inspector'
import { routes } from '@/shared/config'
import { EmptyState, Skeleton } from '@/shared/ui'
import { defaultAuditVariant, parseSlideParam } from '../model/defaultVariant'
import styles from './AuditPage.module.css'
import { DeckDownloads } from './DeckDownloads'
import { SlidePanel } from './SlidePanel'

function DefaultVariantRedirect({ projectId, runId }: { projectId: string; runId: string }) {
  const { search } = useLocation()
  const variants = useVariants(runId)

  if (variants.isPending) {
    return (
      <div className={styles.center} aria-busy="true">
        <Skeleton className={styles.placeholder} />
      </div>
    )
  }

  const target = variants.data ? defaultAuditVariant(variants.data) : null
  if (!target) {
    return (
      <div className={styles.center}>
        <EmptyState
          title={variants.isError ? 'Не удалось загрузить презентацию' : 'Презентация ещё не собрана'}
          description={variants.error?.message ?? 'Доводка откроется, когда будет готов хотя бы один стиль.'}
        />
      </div>
    )
  }

  return <Navigate replace to={{ pathname: routes.polish(projectId, runId, target.id), search }} />
}

export function AuditPage() {
  const { projectId = '', runId = '', variantId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const variant = useVariant(variantId)
  const generation = useGeneration(runId)
  const template = useTemplate(generation.data?.template_id)

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

  const strategy = variant.data?.strategy ?? 'balanced'
  const slideCount = generation.data?.deck_plan?.slides.length ?? null

  return (
    <AuditWorkspace
      key={variantId}
      projectId={projectId}
      runId={runId}
      variantId={variantId}
      slide={parseSlideParam(searchParams.get('slide'))}
      onSlideChange={changeSlide}
      variantHref={(id) => routes.polish(projectId, runId, id)}
      renderStage={(stage) => <SlideInspector {...stage} />}
      actions={
        variant.data ? (
          <DeckDownloads projectId={projectId} variant={variant.data} templateFile={template.data?.filename ?? null} slideCount={slideCount} />
        ) : null
      }
      renderSlidePanel={({ slideNumber }) => <SlidePanel key={slideNumber} runId={runId} variantId={variantId} strategy={strategy} slideNumber={slideNumber} />}
    />
  )
}
