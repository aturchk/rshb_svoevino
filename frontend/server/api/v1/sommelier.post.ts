import { isFoodGroupId } from '@/entities/pairing/lib/foods'
import type { SommelierAnswer } from '@/entities/pairing/model/types'

import { isValidSlug } from '../../utils/catalog'
import { useSommelierBackend } from '../../utils/sommelier'

/**
 * «Что у вас на ужин?» — вердикт сомелье и вина, которые подойдут лучше.
 * POST { slug, food } → SommelierAnswer. Здесь же в будущем отвечает LLM.
 */
export default defineEventHandler(async (event): Promise<SommelierAnswer> => {
  const body = await readBody<{ slug?: unknown; food?: unknown }>(event)
  const slug = typeof body?.slug === 'string' ? body.slug : ''
  if (!isValidSlug(slug) || !isFoodGroupId(body?.food)) {
    throw createError({ statusCode: 400, message: 'Ожидается { slug, food }' })
  }
  const answer = await useSommelierBackend().answer(slug, body.food)
  if (!answer) {
    throw createError({ statusCode: 404, message: 'Вина с таким адресом нет в каталоге' })
  }
  return answer
})
