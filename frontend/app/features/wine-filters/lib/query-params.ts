import type { WineQuery } from '@/entities/wine'
import { EMPTY_QUERY, STYLE_UNKNOWN } from '@/entities/wine'

/**
 * URL — единственный источник правды по фильтрам и поиску.
 * Вся сериализация живёт здесь: по коду не должно быть ни одного
 * searchParams.get('cat') с магической строкой.
 */
export const PARAM = {
  text: 'q',
  categories: 'cat',
  regions: 'reg',
  styles: 'style',
  grapes: 'grape',
  wineries: 'winery',
  sparkling: 'sp',
  photo: 'photo',
  abv: 'abv',
  abvUnknown: 'abvu',
} as const

/** «Стиль не указан» — это значение фильтра, поэтому в URL оно тоже должно кодироваться. */
const UNKNOWN_TOKEN = 'u'

function parseList(raw: string | null): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => (item === UNKNOWN_TOKEN ? STYLE_UNKNOWN : Number(item)))
    .filter((value) => Number.isInteger(value))
}

function serializeList(values: number[]): string {
  return values.map((value) => (value === STYLE_UNKNOWN ? UNKNOWN_TOKEN : value)).join(',')
}

export function parseQuery(params: URLSearchParams): WineQuery {
  const abvRaw = params.get(PARAM.abv)
  let abvMin: number | null = null
  let abvMax: number | null = null
  if (abvRaw) {
    const [from, to] = abvRaw.split('-')
    const parsedFrom = Number(from)
    const parsedTo = Number(to)
    if (Number.isFinite(parsedFrom)) abvMin = parsedFrom
    if (Number.isFinite(parsedTo)) abvMax = parsedTo
  }

  return {
    text: params.get(PARAM.text) ?? '',
    categories: parseList(params.get(PARAM.categories)),
    regions: parseList(params.get(PARAM.regions)),
    styles: parseList(params.get(PARAM.styles)),
    grapes: parseList(params.get(PARAM.grapes)),
    wineries: parseList(params.get(PARAM.wineries)),
    sparklingOnly: params.get(PARAM.sparkling) === '1',
    withPhotoOnly: params.get(PARAM.photo) === '1',
    abvMin,
    abvMax,
    // Вина без указанной крепости включены по умолчанию: иначе первое касание
    // ползунка молча прячет 522 позиции.
    abvIncludeUnknown: params.get(PARAM.abvUnknown) !== '0',
  }
}

export function serializeQuery(query: WineQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.text.trim()) params.set(PARAM.text, query.text.trim())
  if (query.categories.length) params.set(PARAM.categories, serializeList(query.categories))
  if (query.regions.length) params.set(PARAM.regions, serializeList(query.regions))
  if (query.styles.length) params.set(PARAM.styles, serializeList(query.styles))
  if (query.grapes.length) params.set(PARAM.grapes, serializeList(query.grapes))
  if (query.wineries.length) params.set(PARAM.wineries, serializeList(query.wineries))
  if (query.sparklingOnly) params.set(PARAM.sparkling, '1')
  if (query.withPhotoOnly) params.set(PARAM.photo, '1')
  if (query.abvMin !== null && query.abvMax !== null) {
    params.set(PARAM.abv, `${query.abvMin}-${query.abvMax}`)
  }
  if (!query.abvIncludeUnknown) params.set(PARAM.abvUnknown, '0')
  return params
}

/** Активен ли хоть один фильтр — от этого зависит показ кнопки сброса. */
export function hasActiveFilters(query: WineQuery): boolean {
  return (
    query.text.trim() !== '' ||
    query.categories.length > 0 ||
    query.regions.length > 0 ||
    query.styles.length > 0 ||
    query.grapes.length > 0 ||
    query.wineries.length > 0 ||
    query.sparklingOnly ||
    query.withPhotoOnly ||
    query.abvMin !== null ||
    query.abvMax !== null ||
    !query.abvIncludeUnknown
  )
}

export function countActiveFilters(query: WineQuery): number {
  return (
    query.categories.length +
    query.regions.length +
    query.styles.length +
    query.grapes.length +
    query.wineries.length +
    (query.sparklingOnly ? 1 : 0) +
    (query.withPhotoOnly ? 1 : 0) +
    (query.abvMin !== null ? 1 : 0)
  )
}

export const DEFAULT_QUERY = EMPTY_QUERY
