import type { RecognizeResult, ScanCandidate } from '@/entities/scan/model/types'
import { summarize } from '@/entities/wine/lib/summary'
import type { WineCard } from '@/entities/wine/model/types'

import { loadWineDetail, useCatalog } from '../../utils/catalog'
import { demoRecognize } from '../../utils/demo-recognizer'
import { retrieveFromDhash } from '../../utils/dhash-retrieval'
import { retrieveFromMl } from '../../utils/ml-client'
import { attributeSimilarWines } from '../../utils/similar-wines'

const MAX_BYTES = 12 * 1024 * 1024
const SIMILAR_IN_CARD = 5

function looksLikeImage(data: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to))
  if (data[0] === 0xff && data[1] === 0xd8) return true
  if (data[0] === 0x89 && ascii(1, 4) === 'PNG') return true
  if (ascii(0, 3) === 'GIF') return true
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true
  return ascii(4, 8) === 'ftyp'
}

async function cardOf(slug: string): Promise<WineCard | null> {
  const detail = await loadWineDetail(slug)
  if (!detail) return null
  return { ...detail, similar: await attributeSimilarWines.forWine(slug, SIMILAR_IN_CARD) }
}

export default defineEventHandler(async (event): Promise<RecognizeResult> => {
  const form = await readMultipartFormData(event)
  const image = form?.find((part) => part.name === 'image')
  if (!image?.data?.length) {
    throw createError({ statusCode: 400, message: 'Ожидается непустое поле image' })
  }
  if (image.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'Фото больше 12 МБ' })
  }
  if (!looksLikeImage(image.data)) {
    throw createError({ statusCode: 415, message: 'Ожидается JPEG, PNG, WebP или HEIC' })
  }

  const config = useRuntimeConfig(event)
  if (config.public.demoScan === true) {
    const scenario = form?.find((part) => part.name === 'scenario')?.data.toString('utf8')
    const requested = ['matched', 'low_confidence', 'not_found'].includes(scenario ?? '')
      ? (scenario as 'matched' | 'low_confidence' | 'not_found')
      : null
    return demoRecognize(image.data, requested)
  }

  const ml = config.ml.fallback === 'dhash'
    ? await retrieveFromDhash(image.data)
    : await retrieveFromMl(
        config.ml.baseUrl,
        { data: image.data, filename: image.filename, type: image.type },
        Number(config.ml.timeoutMs),
      )
  const { index, idBySlug } = await useCatalog()
  for (const item of ml.top5) {
    if (!idBySlug.has(item.slug)) {
      throw createError({ statusCode: 502, message: 'ML-сервис вернул неизвестный slug' })
    }
  }

  const candidates: ScanCandidate[] = ml.top5.slice(1).map((item) => ({
    ...summarize(index, idBySlug.get(item.slug) as number),
    score: item.score,
  }))
  const card = ml.status === 'not_found' || !ml.top1 ? null : await cardOf(ml.top1.slug)
  const analogs = ml.status === 'not_found' && ml.top1
    ? await attributeSimilarWines.forWine(ml.top1.slug, 5)
    : []

  return {
    ...ml,
    card,
    candidates,
    analogs,
    demo: false,
  }
})
