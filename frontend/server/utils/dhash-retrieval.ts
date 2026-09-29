import sharp from 'sharp'

import type { MlRetrieveResult } from './ml-client'
import index from '../assets/dhash-index.json'
import { dhashSimilarity, imageDhash } from './dhash-core'

const entries: [string, string][] = index.entries as [string, string][]

export const liteMetadata = {
  modelVersion: {
    pipeline: 'dhash-lite',
    modelId: null,
    revision: null,
    adapterSha256: null,
    gallerySize: entries.length,
  },
  thresholdVersion: null,
  calibrated: false,
}

export async function retrieveFromDhash(image: Uint8Array): Promise<MlRetrieveResult> {
  if (index.sharpVersion !== sharp.versions.sharp) {
    throw createError({ statusCode: 503, message: 'Версия индекса не совпадает с обработчиком изображений' })
  }
  const started = performance.now()
  let hash: string
  try {
    hash = await imageDhash(image)
  } catch (cause: unknown) {
    throw createError({ statusCode: 400, message: 'Не удалось прочитать изображение', cause })
  }
  const top5 = entries
    .map(([slug, reference]) => ({ slug, score: dhashSimilarity(hash, reference) }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, 5)
  const top1 = top5[0] ?? null
  return {
    status: top1 ? 'low_confidence' : 'not_found',
    top1,
    top5,
    confidence: {
      top1: top1?.score ?? null,
      margin: top1 && top5[1] ? top1.score - top5[1].score : null,
    },
    latencyMs: Math.round((performance.now() - started) * 100) / 100,
    ...liteMetadata,
  }
}
