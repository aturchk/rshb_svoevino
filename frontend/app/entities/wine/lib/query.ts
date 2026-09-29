import { normalizeSearchText } from '@/shared/lib/normalize'

import type {
  FacetCounts,
  FacetKey,
  QueryResult,
  WineIndex,
  WineQuery,
} from '../model/types'
import { STYLE_UNKNOWN } from '../model/types'

/**
 * Движок фильтрации каталога. Чистый модуль: ни React, ни DOM, ни fetch —
 * поэтому его можно тестировать напрямую и, если каталог когда-нибудь вырастет
 * на два порядка, целиком перенести в воркер, не трогая компоненты.
 *
 * Схема гибридная:
 *   1) пересечение постинг-листов по категориальным фасетам (дёшево, отсекает основное);
 *   2) линейный проход по оставшимся кандидатам для подстроки и диапазона крепости —
 *      диапазон через Map не выражается в принципе.
 */

/** Пересечение двух отсортированных списков слиянием: O(n + m). */
function intersectSorted(a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Uint32Array(Math.min(a.length, b.length))
  let ai = 0
  let bi = 0
  let size = 0
  while (ai < a.length && bi < b.length) {
    const av = a[ai] as number
    const bv = b[bi] as number
    if (av === bv) {
      out[size++] = av
      ai++
      bi++
    } else if (av < bv) {
      ai++
    } else {
      bi++
    }
  }
  return out.subarray(0, size)
}

/** Объединение внутри одной фасеты: выбрать «Крым» и «Кубань» — значит или то, или другое. */
function unionSorted(lists: Uint32Array[]): Uint32Array {
  if (lists.length === 0) return new Uint32Array(0)
  if (lists.length === 1) return lists[0] as Uint32Array
  let total = 0
  for (const list of lists) total += list.length
  const merged = new Uint32Array(total)
  let size = 0
  for (const list of lists) {
    merged.set(list, size)
    size += list.length
  }
  merged.sort()
  const out = new Uint32Array(size)
  let unique = 0
  for (let i = 0; i < size; i++) {
    const value = merged[i] as number
    if (i === 0 || value !== merged[i - 1]) out[unique++] = value
  }
  return out.subarray(0, unique)
}

function styleSlot(index: WineIndex, style: number): number {
  return style === STYLE_UNKNOWN ? index.dict.styles.length : style
}

function facetPostings(index: WineIndex, facet: FacetKey, values: number[]): Uint32Array[] {
  switch (facet) {
    case 'categories':
      return values.map((value) => index.postings.category[value] ?? new Uint32Array(0))
    case 'regions':
      return values.map((value) => index.postings.region[value] ?? new Uint32Array(0))
    case 'wineries':
      return values.map((value) => index.postings.winery[value] ?? new Uint32Array(0))
    case 'grapes':
      return values.map((value) => index.postings.grape[value] ?? new Uint32Array(0))
    case 'styles':
      return values.map(
        (value) => index.postings.style[styleSlot(index, value)] ?? new Uint32Array(0),
      )
  }
}

const FACETS: readonly FacetKey[] = ['categories', 'regions', 'styles', 'grapes', 'wineries']

/**
 * Кандидаты по категориальным фасетам. `skip` исключает одну фасету —
 * это нужно для счётчиков «excluding self»: иначе выбор «Крым» обнулил бы
 * счётчики всех остальных регионов и панель фильтров стала бы тупиком.
 */
function candidateIds(index: WineIndex, query: WineQuery, skip?: FacetKey): Uint32Array {
  let result: Uint32Array | null = null
  for (const facet of FACETS) {
    if (facet === skip) continue
    const values = query[facet]
    if (values.length === 0) continue
    const union = unionSorted(facetPostings(index, facet, values))
    result = result === null ? union : intersectSorted(result, union)
    if (result.length === 0) return result
  }
  if (result !== null) return result
  const all = new Uint32Array(index.count)
  for (let i = 0; i < index.count; i++) all[i] = i
  return all
}

/** Все токены запроса должны найтись — «шато пино» не должно отдавать всё «Шато». */
function matchesText(haystack: string, tokens: string[]): boolean {
  for (const token of tokens) {
    if (!haystack.includes(token)) return false
  }
  return true
}

function matchesScalar(index: WineIndex, id: number, query: WineQuery, tokens: string[]): boolean {
  if (query.sparklingOnly && index.sparkling[id] !== 1) return false
  if (query.withPhotoOnly && index.hasImage[id] !== 1) return false

  if (query.abvMin !== null || query.abvMax !== null) {
    const abv = index.abv[id] as number
    if (Number.isNaN(abv)) {
      if (!query.abvIncludeUnknown) return false
    } else {
      if (query.abvMin !== null && abv < query.abvMin) return false
      if (query.abvMax !== null && abv > query.abvMax) return false
    }
  }

  if (tokens.length > 0 && !matchesText(index.search[id] as string, tokens)) return false
  return true
}

function emptyCounts(index: WineIndex): FacetCounts {
  return {
    categories: new Int32Array(index.dict.categories.length),
    regions: new Int32Array(index.dict.regions.length),
    // последний слот — «стиль не указан»
    styles: new Int32Array(index.dict.styles.length + 1),
    grapes: new Int32Array(index.dict.grapes.length),
    wineries: new Int32Array(index.dict.wineries.length),
  }
}

export function runQuery(index: WineIndex, query: WineQuery): QueryResult {
  const tokens = normalizeSearchText(query.text).split(' ').filter(Boolean)

  const candidates = candidateIds(index, query)
  const ids = new Uint32Array(candidates.length)
  let size = 0
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i] as number
    if (matchesScalar(index, id, query, tokens)) ids[size++] = id
  }

  const counts = emptyCounts(index)
  for (const facet of FACETS) {
    // Для фасеты с активным выбором считаем по выдаче без её собственного условия,
    // иначе невыбранные значения показали бы ноль и их нельзя было бы добавить.
    const base = query[facet].length === 0 ? candidates : candidateIds(index, query, facet)
    const target = counts[facet]
    for (let i = 0; i < base.length; i++) {
      const id = base[i] as number
      if (!matchesScalar(index, id, query, tokens)) continue
      switch (facet) {
        case 'categories':
          target[index.category[id] as number]! += 1
          break
        case 'regions':
          target[index.region[id] as number]! += 1
          break
        case 'wineries':
          target[index.winery[id] as number]! += 1
          break
        case 'styles':
          target[styleSlot(index, index.style[id] as number)]! += 1
          break
        case 'grapes':
          for (const grape of index.grapes[id] as number[]) target[grape]! += 1
          break
      }
    }
  }

  return { ids: ids.subarray(0, size), counts }
}

export const __testing = { intersectSorted, unionSorted }
