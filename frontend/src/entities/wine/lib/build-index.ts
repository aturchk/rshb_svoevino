import type { WineDict, WineIndexFile } from '@/shared/config/dataset-schema'
import { normalizeSearchText } from '@/shared/lib/normalize'

import type { WineIndex, WinePostings } from '../model/types'
import { STYLE_UNKNOWN } from '../model/types'

/**
 * Разбор сгенерированных JSON в рантайм-индекс. Чистая функция без fetch и DOM:
 * благодаря этому её можно прогнать в тестах на настоящем датасете с диска.
 */

/** Постинг-листы: один проход по каталогу, результат уже отсортирован по id. */
function buildPostings(file: WineIndexFile, dict: WineDict): WinePostings {
  const collect = (size: number, valuesOf: (i: number) => number[]): Uint32Array[] => {
    const buckets: number[][] = Array.from({ length: size }, () => [])
    for (let i = 0; i < file.count; i++) {
      for (const value of valuesOf(i)) buckets[value]?.push(i)
    }
    return buckets.map((bucket) => Uint32Array.from(bucket))
  }

  return {
    category: collect(dict.categories.length, (i) => [file.c[i] as number]),
    region: collect(dict.regions.length, (i) => [file.r[i] as number]),
    winery: collect(dict.wineries.length, (i) => [file.w[i] as number]),
    grape: collect(dict.grapes.length, (i) => file.g[i] as number[]),
    // +1 слот под «стиль не указан»
    style: collect(dict.styles.length + 1, (i) => {
      const style = file.st[i] as number
      return [style === STYLE_UNKNOWN ? dict.styles.length : style]
    }),
  }
}

export function buildWineIndex(dict: WineDict, file: WineIndexFile): WineIndex {
  const count = file.count
  const abv = new Float32Array(count)
  const search = new Array<string>(count)
  const winery = Uint16Array.from(file.w)

  for (let i = 0; i < count; i++) {
    const value = file.abv[i]
    abv[i] = value === null || value === undefined ? Number.NaN : value
    // Поисковая строка собирается здесь, а не лежит в JSON: она на 100% выводится
    // из названия и винодельни и стоила бы 123 КБ трафика (36% файла) впустую.
    search[i] =
      `${normalizeSearchText(file.n[i] as string)} ${dict.wineriesNorm[winery[i] as number] ?? ''}`
  }

  return {
    count,
    dict,
    slugs: file.s,
    names: file.n,
    search,
    category: Uint8Array.from(file.c),
    region: Uint8Array.from(file.r),
    winery,
    style: Int8Array.from(file.st),
    sparkling: Uint8Array.from(file.sp),
    hasImage: Uint8Array.from(file.img),
    imgWidth: Uint16Array.from(file.iw),
    imgHeight: Uint16Array.from(file.ih),
    abv,
    grapes: file.g,
    postings: buildPostings(file, dict),
  }
}
