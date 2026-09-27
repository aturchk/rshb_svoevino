import type { WineCard } from '@/entities/wine/model/types'

import { loadWineDetail } from '../../../utils/catalog'
import { attributeSimilarWines } from '../../../utils/similar-wines'

/** Сколько похожих вин в карточке: ТЗ просит 3–5. */
const SIMILAR_LIMIT = 5

/**
 * Карточка вина в JSON — то, что по ТЗ «отдаёт бэкенд и разбирает фронтенд».
 * Данные каталога и похожие вина приходят одним ответом: карточка — один запрос.
 */
export default defineEventHandler(async (event): Promise<WineCard> => {
  const slug = getRouterParam(event, 'slug') ?? ''
  const detail = await loadWineDetail(slug)
  if (!detail) {
    throw createError({ statusCode: 404, message: 'Вина с таким адресом нет в каталоге' })
  }
  const similar = await attributeSimilarWines.forWine(slug, SIMILAR_LIMIT)
  // Каталог меняется только вместе со сборкой данных — ответ можно кэшировать.
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  return { ...detail, similar }
})
