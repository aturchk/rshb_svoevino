import type { WineDetailFile, WineDict } from '@/shared/config/dataset-schema'

/**
 * Доменные типы каталога. Единственный источник правды для приложения;
 * формат файлов на диске описан в shared/config/dataset-schema.ts,
 * потому что его должен видеть и скрипт сборки, которому слой entities недоступен.
 */

export type Wine = WineDetailFile

/** Короткая карточка для лент и списков: всё, что нужно, без запроса детальной. */
export interface WineSummary {
  slug: string
  name: string
  winery: string
  category: string
  style: string | null
  sparkling: boolean
  abv: number | null
  image: { src: string; width: number; height: number } | null
}

/** Похожее вино с человеческим объяснением, почему оно похоже. */
export interface SimilarWine extends WineSummary {
  reasons: string[]
}

/** Карточка, которую отдаёт бэкенд: данные каталога плюс похожие вина — один запрос. */
export interface WineCard extends Wine {
  similar: SimilarWine[]
}

/**
 * Подбор аналогов по частичным признакам: «вина нет в каталоге — оно красное сухое».
 * null — признак неизвестен и не учитывается (а не «нет»). Поля с запасом на будущее:
 * OCR этикетки даст сорт и регион, а pgvector — эмбеддинг снимка.
 */
export interface AnalogQuery {
  category: string | null
  style: string | null
  sparkling: boolean | null
  fortified?: boolean | null
  grapes?: string[]
  region?: string | null
  /** Эмбеддинг снимка для реализации на pgvector; реализация по признакам его не читает. */
  embedding?: number[] | null
  /** slug, которые уже показаны пользователю */
  exclude: string[]
}

/**
 * Шов под эмбеддинги. Сейчас реализация — правила по признакам каталога
 * (lib/similarity.ts, server/utils/similar-wines.ts). Позже — ближайшие соседи
 * SigLIP-эмбеддингов в pgvector; сигнатура и форма ответа не меняются.
 */
export interface SimilarWinesProvider {
  forWine(slug: string, limit: number): Promise<SimilarWine[]>
  forQuery(query: AnalogQuery, limit: number): Promise<SimilarWine[]>
}

/** «Стиль не указан в названии» — отдельное значение фильтра, а не отсутствие фильтра. */
export const STYLE_UNKNOWN = -1

/**
 * Рантайм-представление индекса. В JSON лежат обычные number[]; здесь они
 * обёрнуты в типизированные массивы — ради этого и выбран колоночный формат:
 * 2103 объекта не аллоцируются, фильтрация идёт по непрерывной памяти.
 */
export interface WineIndex {
  count: number
  dict: WineDict
  slugs: string[]
  names: string[]
  /** name + винодельня, нормализованные: строится один раз при загрузке */
  search: string[]
  category: Uint8Array
  region: Uint8Array
  winery: Uint16Array
  /** индекс стиля либо STYLE_UNKNOWN */
  style: Int8Array
  sparkling: Uint8Array
  hasImage: Uint8Array
  imgWidth: Uint16Array
  imgHeight: Uint16Array
  /** крепость; NaN = в данных не закодирована */
  abv: Float32Array
  grapes: number[][]
  /** канонические сорта (dict.grapeKeys) — для схожести и правил сомелье */
  grapeKeys: number[][]
  fortified: Uint8Array
  oak: Uint8Array
  sweetHint: Uint8Array
  postings: WinePostings
}

/**
 * Инвертированные индексы: значение фасеты → отсортированный список позиций.
 * Строятся в рантайме за один проход, а не лежат в JSON: типизированных
 * массивов в JSON нет, а хранить их числами — это лишние сотни килобайт трафика.
 */
export interface WinePostings {
  category: Uint32Array[]
  region: Uint32Array[]
  winery: Uint32Array[]
  grape: Uint32Array[]
  /** последний слот — позиции, у которых стиль не указан */
  style: Uint32Array[]
}

export interface WineQuery {
  text: string
  categories: number[]
  regions: number[]
  styles: number[]
  grapes: number[]
  wineries: number[]
  sparklingOnly: boolean
  withPhotoOnly: boolean
  abvMin: number | null
  abvMax: number | null
  /** Без этого первое касание ползунка молча прячет 566 позиций без крепости. */
  abvIncludeUnknown: boolean
}

export const EMPTY_QUERY: WineQuery = {
  text: '',
  categories: [],
  regions: [],
  styles: [],
  grapes: [],
  wineries: [],
  sparklingOnly: false,
  withPhotoOnly: false,
  abvMin: null,
  abvMax: null,
  abvIncludeUnknown: true,
}

export type FacetKey = 'categories' | 'regions' | 'styles' | 'grapes' | 'wineries'

/** Счётчики считаются динамически: статические врут, как только выбран любой фильтр. */
export type FacetCounts = Record<FacetKey, Int32Array>

export interface QueryResult {
  ids: Uint32Array
  counts: FacetCounts
}
