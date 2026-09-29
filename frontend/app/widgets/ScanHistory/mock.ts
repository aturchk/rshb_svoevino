import type { ScanHistoryItem } from '@/entities/scan'

/**
 * Демонстрационные записи. Включаются только через NUXT_PUBLIC_MOCK_SCAN_HISTORY
 * и помечены в интерфейсе как демо: выдавать выдуманные сканы за настоящие нельзя.
 * Вина — настоящие позиции каталога.
 */
export const MOCK_HISTORY: ScanHistoryItem[] = [
  {
    id: 'demo-1',
    scannedAt: '2026-09-21T18:42:00+03:00',
    status: 'matched',
    wineSlug: 'fanagoriya-pelle-calda-saperavi-krasnoe-suhoe-155',
    wineName: 'Pelle Calda',
    winery: 'Фанагория',
    confidence: 0.97,
    thumbnailDataUrl: null,
    demo: true,
  },
  {
    id: 'demo-2',
    scannedAt: '2026-09-20T12:15:00+03:00',
    status: 'not_found',
    wineSlug: null,
    wineName: null,
    confidence: null,
    thumbnailDataUrl: null,
    demo: true,
  },
]
