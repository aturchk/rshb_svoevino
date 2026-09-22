import { cx } from '@/shared/lib/cx'

import styles from './Chip.module.css'

interface ChipProps {
  label: string
  count?: number
  checked: boolean
  onToggle: () => void
}

/**
 * role="switch" + aria-checked, а не просто кнопка: скринридер должен объявлять
 * состояние фильтра, иначе на слух панель неотличима от набора ссылок.
 */
export function Chip({ label, count, checked, onToggle }: ChipProps) {
  const disabled = !checked && count === 0
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cx(styles.chip, checked && styles.checked)}
      onClick={onToggle}
    >
      <span>{label}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  )
}
