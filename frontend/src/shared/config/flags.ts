/**
 * Фиче-флаги. История сканирования по умолчанию пуста: показывать выдуманные
 * записи как настоящие нельзя, поэтому демо-данные включаются явно и помечаются в UI.
 */
export const FLAGS = {
  mockScanHistory: import.meta.env.VITE_ENABLE_MOCK_SCAN_HISTORY === 'true',
} as const
