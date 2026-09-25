import type { BriefErrors, BriefForm as BriefFormState, ContentPlan } from '@/features/submit-brief'
import { ContentSection } from './ContentSection'
import { ModeSection } from './ModeSection'
import { ParamsSection } from './ParamsSection'
import { PurposeSection } from './PurposeSection'
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
}

export function BriefForm({ form, onChange, files, onFilesChange, plan, parsing, parseError, onParseText, errors }: BriefFormProps) {
  return (
    <div className={styles.form}>
      <PurposeSection
        value={form.purpose}
        customPurpose={form.customPurpose}
        error={errors.purpose}
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
        error={errors.content}
        onModeChange={(contentMode) => onChange({ contentMode })}
        onFilesChange={onFilesChange}
        onTextChange={(text) => onChange({ text })}
        onParseText={onParseText}
      />
      <ParamsSection form={form} onChange={onChange} />
      <ModeSection useLlm={form.useLlm} onUseLlmChange={(useLlm) => onChange({ useLlm })} />
    </div>
  )
}
