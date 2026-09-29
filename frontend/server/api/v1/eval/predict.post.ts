import { useCatalog } from '../../../utils/catalog'
import { retrieveFromDhash } from '../../../utils/dhash-retrieval'
import { evaluateWithMl } from '../../../utils/ml-client'

const MAX_BYTES = 12 * 1024 * 1024

/** Organizer-compatible flat Top-1 response, proxied to the internal ML service. */
export default defineEventHandler(async (event): Promise<{ slug: string | null }> => {
  const form = await readMultipartFormData(event)
  const image = form?.find((part) => part.name === 'image')
  if (!image?.data?.length) {
    throw createError({ statusCode: 400, message: 'Ожидается непустое поле image' })
  }
  if (image.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'Фото больше 12 МБ' })
  }

  const config = useRuntimeConfig(event)
  const result = config.ml.fallback === 'dhash'
    ? { slug: (await retrieveFromDhash(image.data)).top1?.slug ?? null }
    : await evaluateWithMl(
        config.ml.baseUrl,
        { data: image.data, filename: image.filename, type: image.type },
        Number(config.ml.timeoutMs),
      )
  if (result.slug !== null) {
    const { idBySlug } = await useCatalog()
    if (!idBySlug.has(result.slug)) {
      throw createError({ statusCode: 502, message: 'ML-сервис вернул неизвестный slug' })
    }
  }
  return result
})
