import { Link } from 'react-router-dom'

import type { ScanHistoryItem } from '@/entities/scan'
import { wineRoute } from '@/shared/config/routes'

import styles from './ScanHistory.module.css'

interface ScanHistoryProps {
  items: ScanHistoryItem[]
  isDemo: boolean
  onScanClick: () => void
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

export function ScanHistory({ items, isDemo, onScanClick }: ScanHistoryProps) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
            stroke="var(--color-accent)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <h2 className={styles.emptyTitle}>Вы ещё ничего не сканировали</h2>
        <p className={styles.emptyText}>
          Отсканированные бутылки появятся здесь, чтобы к ним можно было вернуться.
        </p>
        <button type="button" onClick={onScanClick} style={{ color: 'var(--color-accent)' }}>
          Открыть сканер
        </button>
      </div>
    )
  }

  return (
    <>
      {isDemo && (
        <p className={styles.demoNote}>
          Это демонстрационные записи для проверки вёрстки — настоящих сканирований пока нет.
        </p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemBody}>
              {item.wineSlug && item.wineName ? (
                <Link to={wineRoute(item.wineSlug)} className={styles.itemTitle}>
                  {item.wineName}
                </Link>
              ) : (
                <span className={styles.itemTitle}>Вино не найдено в каталоге</span>
              )}
              <div className={styles.itemMeta}>
                {dateFormatter.format(new Date(item.scannedAt))}
                {item.confidence !== null && ` · уверенность ${Math.round(item.confidence * 100)}%`}
              </div>
            </div>
            <span
              className={`${styles.badge} ${item.status === 'matched' ? styles.matched : styles.missing}`}
            >
              {item.status === 'matched' ? 'Найдено' : 'Не найдено'}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
