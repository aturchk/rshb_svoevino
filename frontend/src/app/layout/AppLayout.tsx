import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { useScannerCollapse } from '@/features/scan-toggle/lib/useScannerCollapse'
import { Skeleton } from '@/shared/ui/Skeleton'
import { ScannerPanel } from '@/widgets/ScannerPanel'
import { StickyHeader } from '@/widgets/StickyHeader'

import styles from './AppLayout.module.css'

const SCANNER_PANEL_ID = 'scanner-panel'

export function AppLayout() {
  const { collapsed, toggle, expand, panelRef, shellRef, height } = useScannerCollapse()

  return (
    <>
      <a className={styles.skipLink} href="#main">
        Перейти к содержимому
      </a>

      <StickyHeader
        showScanButton={collapsed}
        onScanClick={expand}
        scannerPanelId={SCANNER_PANEL_ID}
      />

      <ScannerPanel
        ref={panelRef}
        collapsed={collapsed}
        onCollapse={() => {
          if (!collapsed) toggle()
        }}
        id={SCANNER_PANEL_ID}
      />

      <div ref={shellRef} className={styles.shell}>
        {/* Распорка резервирует место под фиксированную панель.
            Её высота меняется мгновенно — анимируется только transform. */}
        <div className={styles.spacer} style={{ height: collapsed ? 0 : height }} />
        <main id="main" className={styles.content}>
          <Suspense fallback={<Skeleton height="320px" radius="var(--radius-lg)" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </>
  )
}
