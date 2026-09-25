import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useVariantAudit } from '@/entities/audit'
import { useGeneration } from '@/entities/generation'
import { usePassport, type QualityPassport } from '@/entities/passport'
import { useProject } from '@/entities/project'
import { useCapabilities, useSkillManifest, useVersion } from '@/entities/system'
import { useTemplate } from '@/entities/template'
import { orderVariants, strategyInfo, useVariants, variantMetrics, type VariantSummary } from '@/entities/variant'
import { ExportFileCard, isStaleFile } from '@/features/export-deck'
import { ReproduceCommand } from '@/features/reproduce-run'
import { useVariantFiles } from '@/features/variant-files'
import { buildPassportView, EditabilityProof, QualityPassport as PassportPanel } from '@/widgets/quality-passport'
import { artifactUrl } from '@/shared/api'
import { GENERATION_BUDGET_SECONDS, routes } from '@/shared/config'
import { Button, EmptyState, PageHeader, Segmented, Skeleton } from '@/shared/ui'
import { currentRevisionOf, exportFileName, htmlExportSupported, pickVariantId, serverSkillVersion, withPassportMeta } from '../lib/exportPage'
import styles from './ExportPage.module.css'

function revisionText(revision: number | null): string | null {
  return revision === null ? null : `r${revision}`
}

function PassportLoading() {
  return (
    <div className={styles.passportLoading} aria-busy="true" aria-label="Загружаем паспорт качества">
      <Skeleton style={{ height: 22, width: 200 }} />
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} style={{ height: 56 }} delay={index * 0.1} />
      ))}
    </div>
  )
}

interface ExportContentProps {
  projectId: string
  runId: string
  variant: VariantSummary
  variants: VariantSummary[]
}

function ExportContent({ projectId, runId, variant, variants }: ExportContentProps) {
  const navigate = useNavigate()
  const variantFiles = useVariantFiles(variant.id)
  const audit = useVariantAudit(variant.id)
  const generation = useGeneration(runId)
  const project = useProject(projectId)
  const template = useTemplate(generation.data?.template_id)
  const capabilities = useCapabilities()
  const manifest = useSkillManifest()
  const version = useVersion()
  const passportQuery = usePassport(variantFiles.passportArtifactId)

  const files = variantFiles.files
  const passport: QualityPassport | null = passportQuery.data ?? null
  const currentRevision = currentRevisionOf(audit.data?.deck_revision, [files?.pdf ?? null, files?.quality_passport ?? null])
  const passportStale = isStaleFile(files?.quality_passport ?? null, currentRevision)
  const passportRevision = files?.quality_passport?.deckRevision ?? null
  const info = strategyInfo(variant.strategy)
  const htmlSupported = htmlExportSupported(capabilities.data)

  const view = useMemo(
    () =>
      passport
        ? buildPassportView(passport, {
            budgetSeconds: GENERATION_BUDGET_SECONDS,
            planner: variant.planner,
            serverSkillVersion: serverSkillVersion(manifest.data, version.data),
            fallbackPei: variantMetrics(variant).editabilityLevel,
          })
        : null,
    [passport, variant, manifest.data, version.data],
  )

  const pptxFile = withPassportMeta(files?.pptx ?? null, passport, Boolean(passport) && !passportStale)
  const rasterOnly = passport?.editability.rasterOnlySlides ?? null
  const roundTrip = passport ? (passport.validity.roundTripOk ?? passport.validity.opensCleanly) : null
  const slideCount = generation.data?.deck_plan?.brief?.target_slide_count ?? project.data?.target_slide_count ?? null
  const templateFile = template.data?.filename ?? passport?.inputs.templateName ?? null
  const revisionLabel = revisionText(currentRevision)

  const description = [
    `Вариант «${info.name}»${revisionLabel ? ` · ревизия ${revisionLabel}` : ''}.`,
    roundTrip === true && !passportStale ? 'Файл собран, повторно открыт и проверен.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const options = variants.map((item) => ({ value: item.id, label: strategyInfo(item.strategy).name }))

  const cards = [
    {
      format: 'pptx' as const,
      file: pptxFile,
      note: 'Нативные объекты: текст, таблицы и графики правятся в PowerPoint',
      tag: rasterOnly === 0 ? 'Редактируемый' : undefined,
      primary: true,
    },
    { format: 'pdf' as const, file: files?.pdf ?? null, note: 'Для рассылки и печати' },
    ...(htmlSupported || files?.html
      ? [{ format: 'html' as const, file: files?.html ?? null, note: 'Слайды разметкой для браузера', supported: htmlSupported }]
      : []),
    { format: 'quality_passport' as const, file: files?.quality_passport ?? null, note: 'Паспорт качества целиком' },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Шаг 7 · Экспорт и паспорт"
        title="Редактируемый PPTX в стиле шаблона"
        description={description}
        actions={
          <>
            {options.length > 1 && (
              <Segmented
                label="Вариант для экспорта"
                options={options}
                value={variant.id}
                onChange={(id) => navigate(routes.export(projectId, runId, id), { replace: true })}
              />
            )}
            <Button size="lg" onClick={() => navigate(routes.audit(projectId, runId, variant.id))}>
              ← К аудиту
            </Button>
          </>
        }
      />

      {view ? (
        <EditabilityProof cells={view.proof} />
      ) : (
        passportQuery.isPending && variantFiles.passportArtifactId && <Skeleton style={{ height: 104, borderRadius: 14 }} />
      )}

      <div className={styles.grid}>
        <section className={styles.files} aria-labelledby="export-files-title">
          <h2 id="export-files-title" className={styles.sectionTitle}>
            Файлы
          </h2>
          {variantFiles.isPending ? (
            [0, 1, 2, 3].map((index) => <Skeleton key={index} style={{ height: 78, borderRadius: 12 }} delay={index * 0.08} />)
          ) : (
            cards.map((card) => (
              <ExportFileCard
                key={`${variant.id}:${card.format}`}
                projectId={projectId}
                variantId={variant.id}
                format={card.format}
                file={card.file}
                currentRevision={currentRevision}
                supported={card.supported ?? true}
                fileName={exportFileName(variant.strategy, card.format, card.file?.deckRevision ?? currentRevision)}
                note={card.note}
                tag={card.tag}
                primary={card.primary}
              />
            ))
          )}
          {variantFiles.error && (
            <p className={styles.error} role="alert">
              Не удалось загрузить файлы варианта: {variantFiles.error.message}
            </p>
          )}
          <ReproduceCommand templateFile={templateFile} contentFile={null} strategy={variant.strategy} slideCount={slideCount} />
        </section>

        {view ? (
          <PassportPanel
            view={view}
            revisionLabel={revisionText(passportRevision)}
            actions={
              variantFiles.passportArtifactId && (
                <a className={styles.jsonLink} href={artifactUrl(variantFiles.passportArtifactId)} download={exportFileName(variant.strategy, 'quality_passport', passportRevision)}>
                  Скачать JSON паспорта
                </a>
              )
            }
            notice={
              passportStale && (
                <p className={styles.notice}>
                  Паспорт относится к ревизии {revisionText(passportRevision)}, текущая — {revisionLabel}.
                </p>
              )
            }
          />
        ) : passportQuery.isPending && variantFiles.passportArtifactId ? (
          <PassportLoading />
        ) : (
          <div className={styles.passportEmpty}>
            <EmptyState
              title={passportQuery.error ? 'Паспорт качества не удалось прочитать' : 'Паспорт качества ещё не собран'}
              description={
                passportQuery.error
                  ? passportQuery.error.message
                  : 'Соберите его в списке файлов слева.'
              }
            />
          </div>
        )}
      </div>
    </>
  )
}

export function ExportPage() {
  const { projectId = '', runId = '', variantId } = useParams()
  const variantsQuery = useVariants(runId)
  const variants = useMemo(() => orderVariants(variantsQuery.data ?? []), [variantsQuery.data])
  const selectedId = pickVariantId(variants, variantId)
  const selected = variants.find((variant) => variant.id === selectedId)

  let content
  if (variantsQuery.isPending) {
    content = (
      <div className={styles.loading} aria-busy="true" aria-label="Загружаем варианты">
        <Skeleton style={{ height: 64 }} />
        <Skeleton style={{ height: 104, borderRadius: 14 }} delay={0.1} />
        <Skeleton style={{ height: 320, borderRadius: 14 }} delay={0.2} />
      </div>
    )
  } else if (variantsQuery.error) {
    content = <EmptyState title="Не удалось загрузить варианты" description={variantsQuery.error.message} actions={<Button onClick={() => variantsQuery.refetch()}>Повторить</Button>} />
  } else if (!selected) {
    content = (
      <EmptyState
        title="Экспортировать пока нечего"
        description="Сначала сгенерируйте три варианта колоды."
        actions={
          <Link className={styles.emptyLink} to={routes.brief(projectId)}>
            К брифу
          </Link>
        }
      />
    )
  } else {
    content = <ExportContent key={selected.id} projectId={projectId} runId={runId} variant={selected} variants={variants} />
  }

  return <div className={styles.page}>{content}</div>
}
