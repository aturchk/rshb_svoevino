import { useId } from 'react'

import styles from './Toggle.module.css'

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}

/** Нативный чекбокс под кастомной отрисовкой: клавиатура и скринридер работают сами. */
export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const id = useId()
  return (
    <label className={styles.wrapper} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
      <span>
        {label}
        {hint && <span className={styles.hint}> · {hint}</span>}
      </span>
    </label>
  )
}
