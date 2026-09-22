import type { ScanHistoryItem } from '@/entities/scan'
import { useScanToggleStore } from '@/features/scan-toggle'
import { FLAGS } from '@/shared/config/flags'
import { MOCK_HISTORY, ScanHistory } from '@/widgets/ScanHistory'

const EMPTY: ScanHistoryItem[] = []

export function HistoryPage() {
  const setCollapsed = useScanToggleStore((state) => state.setCollapsed)
  const items = FLAGS.mockScanHistory ? MOCK_HISTORY : EMPTY

  return (
    <section>
      <h1 style={{ fontSize: 30, marginBottom: 'var(--space-5)' }}>История сканирования</h1>
      <ScanHistory
        items={items}
        isDemo={FLAGS.mockScanHistory}
        onScanClick={() => setCollapsed(false)}
      />
    </section>
  )
}
