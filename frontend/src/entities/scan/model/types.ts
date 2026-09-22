/** Кандидат из поисковой выдачи распознавания. */
export interface RecognizeCandidate {
  slug: string
  score: number
}

/**
 * Результат распознавания. Форма выбрана под две вещи сразу:
 * скрипт оценки кейсодержателя ждёт плоский top-1 со slug, а продуктовый сценарий
 * «вина нет в каталоге» должен отличаться от «нашли, но не уверены».
 */
export interface RecognizeResult {
  status: 'matched' | 'low_confidence' | 'not_found'
  top1: RecognizeCandidate | null
  top5: RecognizeCandidate[]
  latencyMs: number
}

/** Запись истории. Тип настоящий: подключение реальных данных не потребует его менять. */
export interface ScanHistoryItem {
  id: string
  /** ISO-8601 */
  scannedAt: string
  status: RecognizeResult['status']
  wineSlug: string | null
  wineName: string | null
  confidence: number | null
  thumbnailDataUrl: string | null
}
