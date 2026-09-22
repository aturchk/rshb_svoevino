import { forwardRef } from 'react'

import { cx } from '@/shared/lib/cx'

import styles from './ScannerPanel.module.css'

interface ScannerPanelProps {
  collapsed: boolean
  id: string
}

/**
 * Блок-заглушка сканера: рамка видоискателя и честная подпись.
 * Логики камеры и распознавания здесь нет намеренно — шов под ML вынесен
 * в entities/scan/api/recognizeWine.ts.
 */
export const ScannerPanel = forwardRef<HTMLDivElement, ScannerPanelProps>(
  function ScannerPanel({ collapsed, id }, ref) {
    // Переходы задаёт useScannerCollapse инлайн-стилями: только так можно
    // гарантировать порядок кадров. Класс держит конечное состояние.
    const classes = cx(styles.panel, collapsed && styles.hidden)

    return (
      <div ref={ref} id={id} className={classes} inert={collapsed}>
        <div className={styles.inner}>
          <div className={styles.viewfinder}>
            <span className={`${styles.corner} ${styles.tl}`} />
            <span className={`${styles.corner} ${styles.tr}`} />
            <span className={`${styles.corner} ${styles.bl}`} />
            <span className={`${styles.corner} ${styles.br}`} />
            <svg
              className={styles.bottle}
              width="46"
              height="120"
              viewBox="0 0 28 100"
              aria-hidden="true"
            >
              <path
                d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect x="6" y="48" width="16" height="26" rx="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className={styles.text}>
            <span className={styles.badge}>Функция в разработке</span>
            <p className={styles.caption}>
              Наведите камеру на этикетку — и мы найдём вино в каталоге «Своё Вино».
              Распознавание появится в следующей версии, пока каталог доступен поиском
              и фильтрами.
            </p>
          </div>
        </div>
      </div>
    )
  },
)
