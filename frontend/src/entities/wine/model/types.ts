import type { WineDetailFile, WineDict } from '@/shared/config/dataset-schema'

/**
 * Доменные типы каталога. Единственный источник правды для приложения;
 * формат файлов на диске описан в shared/config/dataset-schema.ts,
 * потому что его должен видеть и скрипт сборки, которому слой entities недоступен.
 */

export type Wine = WineDetailFile

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
  /** Без этого первое касание ползунка молча прячет 522 позиции без крепости. */
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
