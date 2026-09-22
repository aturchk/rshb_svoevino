import styles from './RangeSlider.module.css'

interface RangeSliderProps {
  min: number
  max: number
  step: number
  from: number
  to: number
  label: string
  format: (value: number) => string
  onChange: (from: number, to: number) => void
  /** Запись в URL идёт по отпусканию, а не на каждое движение ползунка. */
  onCommit?: () => void
}

export function RangeSlider({
  min,
  max,
  step,
  from,
  to,
  label,
  format,
  onChange,
  onCommit,
}: RangeSliderProps) {
  const span = max - min || 1
  const leftPercent = ((from - min) / span) * 100
  const rightPercent = ((to - min) / span) * 100

  return (
    <div className={styles.root}>
      <div className={styles.values}>
        <span className={styles.current}>{format(from)}</span>
        <span className={styles.current}>{format(to)}</span>
      </div>
      <div className={styles.track}>
        <span className={styles.rail} />
        <span
          className={styles.fill}
          style={{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }}
        />
        <input
          type="range"
          className={styles.input}
          aria-label={`${label}: минимум`}
          min={min}
          max={max}
          step={step}
          value={from}
          onChange={(event) => onChange(Math.min(Number(event.target.value), to), to)}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
        />
        <input
          type="range"
          className={styles.input}
          aria-label={`${label}: максимум`}
          min={min}
          max={max}
          step={step}
          value={to}
          onChange={(event) => onChange(from, Math.max(Number(event.target.value), from))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
        />
      </div>
    </div>
  )
}
