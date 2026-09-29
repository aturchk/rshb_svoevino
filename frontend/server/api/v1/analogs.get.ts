import type { AnalogQuery, SimilarWine } from '@/entities/wine/model/types'

import { attributeSimilarWines, UnknownAnalogValueError } from '../../utils/similar-wines'

const LIMIT_DEFAULT = 5
const LIMIT_MAX = 12

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Аналоги по частичным признакам: вина нет в каталоге, но пользователь знает,
 * что оно, скажем, красное сухое. GET /api/v1/analogs?category=Красное&style=Сухое
 */
export default defineEventHandler(async (event): Promise<SimilarWine[]> => {
  const params = getQuery(event)
  const sparkling = text(params.sparkling)
  const query: AnalogQuery = {
    category: text(params.category),
    style: text(params.style),
    sparkling: sparkling === null ? null : sparkling === '1' || sparkling === 'true',
    exclude: (text(params.exclude) ?? '').split(',').filter(Boolean).slice(0, 50),
  }
  const limit = Math.min(Math.max(Math.floor(Number(params.limit)) || LIMIT_DEFAULT, 1), LIMIT_MAX)
  try {
    return await attributeSimilarWines.forQuery(query, limit)
  } catch (cause: unknown) {
    if (cause instanceof UnknownAnalogValueError) {
      throw createError({
        statusCode: 400,
        message: `Неизвестное значение «${cause.field}». Допустимо: ${cause.allowed.join(', ')}`,
      })
    }
    throw cause
  }
})
