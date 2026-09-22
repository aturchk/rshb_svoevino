import { useMemo, useState } from 'react'

import { normalizeSearchText } from '@/shared/lib/normalize'
import { Chip } from '@/shared/ui/Chip'

import styles from './FilterPanel.module.css'

interface FacetGroupProps {
  legend: string
  labels: readonly string[]
  counts: Int32Array
  selected: number[]
  onToggle: (value: number) => void
  /** Значения фасеты, если они не совпадают с индексом в labels (например, «стиль не указан» = -1). */
  values?: readonly number[]
  /** Для больших справочников (140 сортов, 135 виноделен) — поиск и «показать все». */
  searchable?: boolean
  searchPlaceholder?: string
  initialLimit?: number
}

export function FacetGroup({
  legend,
  labels,
  counts,
  selected,
  onToggle,
  values,
  searchable = false,
  searchPlaceholder,
  initialLimit = 20,
}: FacetGroupProps) {
  const [term, setTerm] = useState('')
  const [expanded, setExpanded] = useState(false)

  const items = useMemo(() => {
    const all = labels.map((label, slot) => {
      const value = values?.[slot] ?? slot
      return {
        value,
        label,
        count: counts[slot] ?? 0,
        selected: selected.includes(value),
      }
    })
    const needle = normalizeSearchText(term)
    const matched = needle
      ? all.filter((item) => normalizeSearchText(item.label).includes(needle))
      : all
    // Выбранное всегда наверху и всегда видно, даже если выпало из топа по счётчику.
    return [...matched].sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1
      return b.count - a.count
    })
  }, [labels, counts, selected, term, values])

  const visible = searchable && !expanded && !term ? items.slice(0, initialLimit) : items
  const hiddenCount = items.length - visible.length

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>

      {searchable && (
        <input
          type="search"
          className={styles.facetSearch}
          placeholder={searchPlaceholder}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          aria-label={`Поиск: ${legend.toLowerCase()}`}
        />
      )}

      {visible.length === 0 ? (
        <p className={styles.nothing}>Ничего не найдено</p>
      ) : (
        <div className={styles.chips}>
          {visible.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              count={item.count}
              checked={item.selected}
              onToggle={() => onToggle(item.value)}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          Показать ещё {hiddenCount}
        </button>
      )}
    </fieldset>
  )
}
