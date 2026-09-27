/**
 * Контракт сгенерированных JSON. Один источник правды для скрипта сборки
 * и для рантайма: если формат разъедется, TypeScript упадёт в обоих местах.
 * Доменные типы приложения строятся поверх этого в entities/wine/model/types.ts.
 */

export const DATA_BASE = 'data'
export const DICT_FILE = `${DATA_BASE}/dict.json`
export const INDEX_FILE = `${DATA_BASE}/wines.index.json`
export const FACETS_FILE = `${DATA_BASE}/facets.json`
export const wineFile = (slug: string): string => `${DATA_BASE}/wines/${slug}.json`

export const IMG_THUMB = (slug: string): string => `img/thumb/${slug}.webp`
export const IMG_DETAIL = (slug: string): string => `img/detail/${slug}.webp`

/** Справочники: индекс в массиве — это то, что лежит в колонках индекса и в URL. */
export interface WineDict {
  categories: string[]
  regions: string[]
  grapes: string[]
  wineries: string[]
  /** Нормализованные названия виноделен: считаются один раз на сборке, для поиска. */
  wineriesNorm: string[]
  styles: string[]
  /**
   * Канонические сорта: «Шираз» и «Сира» — один ключ, заглушки вроде «Белые сорта
   * винограда» выброшены. Для сравнения вин и правил сомелье, не для показа.
   */
  grapeKeys: string[]
}

/**
 * Колоночный формат (structure of arrays). Выигрыш не в весе — gzip и так жмёт
 * повторяющиеся ключи — а в том, что при загрузке не аллоцируется 2103 объекта,
 * а фильтрация идёт по типизированным массивам.
 * В JSON только number[]; в рантайме оборачивается в Uint8Array/Uint16Array/Float32Array.
 */
export interface WineIndexFile {
  count: number
  /** slug — нужен для ссылки и как стабильный ключ виртуализатора */
  s: string[]
  /** название */
  n: string[]
  /** индекс категории */
  c: number[]
  /** индекс региона */
  r: number[]
  /** индекс винодельни */
  w: number[]
  /** индекс стиля, -1 = в названии не указан */
  st: number[]
  /** игристое: 0 | 1 */
  sp: number[]
  /** крепость, % об.; null = в данных не закодирована */
  abv: (number | null)[]
  /** индексы сортов винограда */
  g: number[][]
  /** индексы канонических сортов (dict.grapeKeys) */
  gk: number[][]
  /** креплёное или ликёрное: 0 | 1 */
  fo: number[]
  /** выдержка в дубе по описанию: 0 | 1 */
  ok: number[]
  /** сахар в названии не указан, но описание называет вино сладким или десертным: 0 | 1 */
  sh: number[]
  /** есть ли сгенерированная фотография: 0 | 1 */
  img: number[]
  /** реальные размеры фото — для точного aspect-ratio без CLS; 0 если фото нет */
  iw: number[]
  ih: number[]
}

export interface FacetValue {
  value: number
  count: number
}

export interface WineFacetsFile {
  categories: FacetValue[]
  regions: FacetValue[]
  styles: FacetValue[]
  grapes: FacetValue[]
  wineries: FacetValue[]
  ranges: {
    abv: { min: number; max: number; step: number }
  }
  totals: {
    all: number
    withPhoto: number
    sparkling: number
    withoutStyle: number
    withoutAbv: number
  }
}

/** Полная карточка. Денормализована намеренно: прямой заход на /wine/:slug — один запрос. */
export interface WineDetailFile {
  slug: string
  name: string
  category: string
  colorRaw: string
  colorFamily: string
  region: string
  winery: string
  /** Индексы справочников: нужны, чтобы ссылки с карточки вели в готовый фильтр каталога. */
  wineryId: number
  grapeIds: number[]
  grapes: string[]
  /** Канонические сорта — для правил сомелье; в интерфейсе показываются grapes. */
  grapeKeys: string[]
  description: string
  /**
   * Дословная гастрономическая рекомендация винодельни из описания, если она там есть
   * (~9% позиций). Факт каталога — показывается отдельно от рекомендаций сомелье.
   */
  pairingNote: string | null
  style: string | null
  sparkling: boolean
  /** Креплёное или ликёрное: портвейн, мадера, херес, кагор, десертные от 15%. */
  fortified: boolean
  /** Выдержка в дубе — по описанию винодельни. */
  oak: boolean
  /**
   * Сахар не указан, но описание называет вино сладким или десертным. Подсказка для
   * правил сомелье; в поле «Сахар» карточки не выводится.
   */
  sweetHint: boolean
  abv: number | null
  image: { thumb: string; detail: string; width: number; height: number } | null
}

/** Манифест, который пишет build:images и читает build:data. */
export interface ImagesManifest {
  generatedAt: string
  items: Record<string, { width: number; height: number }>
}
