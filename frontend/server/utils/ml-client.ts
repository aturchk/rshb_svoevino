import type { RecognizeCandidate, RecognizeStatus } from '@/entities/scan/model/types'

export interface MlRetrieveResult {
  status: RecognizeStatus
  top1: RecognizeCandidate | null
  top5: RecognizeCandidate[]
  confidence: { top1: number | null; margin: number | null }
  latencyMs: number
  calibrated: boolean
  modelVersion: {
    pipeline: string
    modelId: string | null
    revision: string | null
    adapterSha256: string | null
    gallerySize: number
  }
  thresholdVersion: string | null
}

export interface MlEvalResult {
  slug: string | null
}

interface ImagePart {
  data: Uint8Array
  filename?: string
  type?: string
}

async function postImage<T>(
  baseUrl: string,
  path: string,
  image: ImagePart,
  timeoutMs: number,
): Promise<T> {
  const body = new FormData()
  const bytes = Uint8Array.from(image.data)
  body.append('image', new Blob([bytes], { type: image.type ?? 'application/octet-stream' }), image.filename ?? 'label.jpg')
  try {
    const response = await $fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      body,
      timeout: timeoutMs,
    })
    return response as T
  } catch (cause: unknown) {
    const status = (cause as { statusCode?: number } | null)?.statusCode
    throw createError({
      statusCode: status === 400 || status === 413 || status === 415 ? status : 502,
      message: status === 400 || status === 413 || status === 415
        ? 'ML-сервис отклонил изображение'
        : 'ML-сервис недоступен',
      cause,
    })
  }
}

export function retrieveFromMl(
  baseUrl: string,
  image: ImagePart,
  timeoutMs: number,
): Promise<MlRetrieveResult> {
  return postImage(baseUrl, '/v1/retrieve', image, timeoutMs)
}

export function evaluateWithMl(
  baseUrl: string,
  image: ImagePart,
  timeoutMs: number,
): Promise<MlEvalResult> {
  return postImage(baseUrl, '/v1/eval/predict', image, timeoutMs)
}
