import { findSimilar, traitsOf } from '@/entities/wine/lib/similarity'
import type { SimilarityTarget } from '@/entities/wine/lib/similarity'
import { toSimilarWine } from '@/entities/wine/lib/summary'
import type { AnalogQuery, SimilarWine, SimilarWinesProvider } from '@/entities/wine/model/types'

import { useCatalog } from './catalog'

/**
 * Реализация шва SimilarWinesProvider по признакам каталога.
 *
 * Замена на эмбеддинги: SELECT slug FROM wines ORDER BY embedding <=> $1 LIMIT 50
 * в pgvector, затем те же ограничения (категория, не больше одного вина винодельни)
 * из lib/similarity.ts. Потребители провайдера ничего не заметят.
 */
/** Значение фильтра, которого нет в справочнике: лучше честный 400, чем «белое» на запрос «красного». */
export class UnknownAnalogValueError extends Error {
  constructor(
    readonly field: string,
    readonly allowed: readonly string[],
  ) {
    super(`Неизвестное значение ${field}`)
  }
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/ё/g, 'е')

/** Поиск в справочнике без учёта регистра и «ё». null на входе — признак неизвестен. */
function lookup(list: readonly string[], value: string | null, field: string): number | null {
  if (value === null) return null
  const position = list.findIndex((item) => normalize(item) === normalize(value))
  if (position === -1) throw new UnknownAnalogValueError(field, list)
  return position
}

export const attributeSimilarWines: SimilarWinesProvider = {
  async forWine(slug, limit) {
    const { index, idBySlug } = await useCatalog()
    const id = idBySlug.get(slug)
    if (id === undefined) return []
    return findSimilar(index, traitsOf(index, id), { limit, exclude: [id] }).map((match) =>
      toSimilarWine(index, match),
    )
  },

  async forQuery(query: AnalogQuery, limit: number): Promise<SimilarWine[]> {
    const { index, idBySlug } = await useCatalog()
    const target: SimilarityTarget = {
      category: lookup(index.dict.categories, query.category, 'category'),
      style: lookup(index.dict.styles, query.style, 'style'),
      sparkling: query.sparkling,
      // Не указано — значит неизвестно: портвейн, описанный как «красное сладкое»,
      // тоже должен находить креплёные.
      fortified: query.fortified ?? null,
      abv: null,
      grapes: (query.grapes ?? [])
        .map((grape) => lookup(index.dict.grapeKeys, grape, 'grapes'))
        .filter((grape): grape is number => grape !== null),
      region: lookup(index.dict.regions, query.region ?? null, 'region'),
      winery: null,
      seriesKey: null,
    }
    const exclude = query.exclude
      .map((slug) => idBySlug.get(slug))
      .filter((id): id is number => id !== undefined)
    return findSimilar(index, target, { limit, exclude }).map((match) =>
      toSimilarWine(index, match),
    )
  },
}
