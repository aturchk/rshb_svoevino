import type { ScanHistoryItem } from '@/entities/scan'

/**
 * Демонстрационные записи. Включаются только через NUXT_PUBLIC_MOCK_SCAN_HISTORY
 * и помечены в интерфейсе как демо: выдавать выдуманные сканы за настоящие нельзя.
 */
export const MOCK_HISTORY: ScanHistoryItem[] = [
  {
    id: 'demo-1',
    scannedAt: '2026-09-21T18:42:00+03:00',
    status: 'matched',
    wineSlug: 'aligote-barrel-2024',
    wineName: 'Алиготе Баррель, 2024',
    confidence: 0.97,
    thumbnailDataUrl: null,
  },
  {
    id: 'demo-2',
    scannedAt: '2026-09-20T12:15:00+03:00',
    status: 'not_found',
    wineSlug: null,
    wineName: null,
    confidence: null,
    thumbnailDataUrl: null,
  },
]
