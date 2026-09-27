import type { SimilarWine, WineCard, WineSummary } from '@/entities/wine'

/** Кандидат из поисковой выдачи распознавания. */
export interface RecognizeCandidate {
  slug: string
  score: number
}

/** Кандидат с короткой карточкой — для «Это не то вино?». */
export interface ScanCandidate extends WineSummary {
  score: number
}

export type RecognizeStatus = 'matched' | 'low_confidence' | 'not_found'

/**
 * Результат распознавания. Форма выбрана под три вещи сразу:
 *  - скрипт оценки кейсодержателя ждёт плоский top-1 со slug (его отдаёт
 *    /api/v1/eval/predict, вырезая из этого ответа);
 *  - «вина нет в каталоге» должно отличаться от «нашли, но не уверены»;
 *  - шторка результата открывается без второго запроса: карточка top-1,
 *    кандидаты и аналоги приходят в том же ответе.
 */
export interface RecognizeResult {
  status: RecognizeStatus
  top1: RecognizeCandidate | null
  top5: RecognizeCandidate[]
  /**
   * Уверенность — для API, в интерфейсе не показывается (так в ТЗ): top-1 и отрыв
   * от второго места. Большой отрыв — повод сразу открыть одну карточку.
   */
  confidence: { top1: number | null; margin: number | null }
  latencyMs: number
  /** Карточка лучшего кандидата: matched и low_confidence. */
  card: WineCard | null
  /** Остальные кандидаты top-5 с короткими карточками. */
  candidates: ScanCandidate[]
  /** Похожие вина из каталога — для «не нашли». */
  analogs: SimilarWine[]
  /** Ответ демо-режима, а не распознавания. Помечается в интерфейсе. */
  demo: boolean
}

/** Сценарий демо-режима: «авто» — по кругу, чтобы на показе прошли все три исхода. */
export type DemoScenario = 'auto' | RecognizeStatus

/** Запись истории. Тип настоящий: подключение распознавания не потребует его менять. */
export interface ScanHistoryItem {
  id: string
  /** ISO-8601 */
  scannedAt: string
  status: RecognizeStatus
  wineSlug: string | null
  wineName: string | null
  winery?: string | null
  confidence: number | null
  thumbnailDataUrl: string | null
  /** Пользователь сам выбрал вино из кандидатов «Это не то вино?» */
  confirmed?: boolean
  /** Запись сделана в демо-режиме — так и подписывается. */
  demo?: boolean
}
