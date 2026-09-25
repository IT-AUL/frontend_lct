import type { Schemas } from '@/shared/api'

export type Project = Schemas['Project'] & {
  latest_run_id?: string | null
  latest_run_state?: string | null
  latest_run_stage?: string | null
}
