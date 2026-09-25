import styles from './StepperInput.module.css'

interface StepperInputProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
}

export function StepperInput({ value, min, max, onChange, label }: StepperInputProps) {
  return (
    <div className={styles.root} role="group" aria-label={label}>
      <button type="button" className={styles.button} aria-label="Меньше" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <output className={styles.value}>{value}</output>
      <button type="button" className={styles.button} aria-label="Больше" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  )
}
