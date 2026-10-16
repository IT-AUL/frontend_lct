import type { BriefErrors, ContentPlan } from '../lib/brief'
import type { BriefForm as BriefFormState } from '../model/form'
import { ContentSection } from './ContentSection'
import { ModeSection } from './ModeSection'
import { ParamsSection } from './ParamsSection'
import { PurposeSection } from './PurposeSection'
import { TopicSection } from './TopicSection'
import styles from './BriefForm.module.css'

export interface BriefFormProps {
  form: BriefFormState
  onChange: (patch: Partial<BriefFormState>) => void
  files: File[]
  onFilesChange: (files: File[]) => void
  plan: ContentPlan
  parsing: boolean
  parseError: string | null
  onParseText: () => void
  errors: BriefErrors
  focusSignal?: number
  contentFill?: boolean
}

export function BriefForm({ form, onChange, files, onFilesChange, plan, parsing, parseError, onParseText, errors, focusSignal, contentFill = false }: BriefFormProps) {
  return (
    <div className={styles.form}>
      <TopicSection value={form.topic} error={errors.content} focusSignal={errors.purpose ? 0 : focusSignal} onChange={(topic) => onChange({ topic })} />
      <PurposeSection
        value={form.purpose}
        customPurpose={form.customPurpose}
        error={errors.purpose}
        focusSignal={focusSignal}
        onChange={(purpose) => onChange({ purpose })}
        onCustomPurposeChange={(customPurpose) => onChange({ customPurpose })}
      />
      <ContentSection
        mode={form.contentMode}
        files={files}
        text={form.text}
        parsed={form.parsed}
        plan={plan}
        parsing={parsing}
        parseError={parseError}
        onModeChange={(contentMode) => onChange({ contentMode })}
        onFilesChange={onFilesChange}
        onTextChange={(text) => onChange({ text })}
        onParseText={onParseText}
      />
      <ParamsSection form={form} onChange={onChange} contentFill={contentFill} />
      <ModeSection useLlm={form.useLlm} onUseLlmChange={(useLlm) => onChange({ useLlm })} variantCount={form.variantCount} onVariantCountChange={(variantCount) => onChange({ variantCount })} />
    </div>
  )
}
