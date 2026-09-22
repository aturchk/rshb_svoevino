import { NavLink } from 'react-router-dom'

import { ROUTES } from '@/shared/config/routes'
import { cx } from '@/shared/lib/cx'

import styles from './StickyHeader.module.css'

interface StickyHeaderProps {
  /** Компактная кнопка появляется только когда модуль сканирования свёрнут. */
  showScanButton: boolean
  onScanClick: () => void
  scannerPanelId: string
}

const TABS = [
  { to: ROUTES.history, label: 'История' },
  { to: ROUTES.catalog, label: 'Каталог' },
] as const

export function StickyHeader({ showScanButton, onScanClick, scannerPanelId }: StickyHeaderProps) {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <NavLink to={ROUTES.home} className={cx(styles.logo)}>
            Своё <span>Вино</span>
          </NavLink>

          <nav className={styles.nav} aria-label="Разделы">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => cx(styles.tab, isActive && styles.active)}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          {showScanButton && (
            <button
              type="button"
              className={styles.scanButton}
              onClick={onScanClick}
              aria-expanded={false}
              aria-controls={scannerPanelId}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none">
                <path
                  d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className={styles.label}>Сканировать</span>
            </button>
          )}
        </div>
      </header>

      <nav className={styles.tabbar} aria-label="Разделы">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => cx(styles.tabbarItem, isActive && styles.tabbarActive)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
