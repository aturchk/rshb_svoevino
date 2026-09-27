import type { RecognizeResult, RecognizeStatus } from '@/entities/scan/model/types'

import { demoRecognize } from '../../utils/demo-recognizer'

/** Больше не нужно: клиент ужимает снимок до ~300 КБ, 12 МБ — запас на исходник без сжатия. */
const MAX_BYTES = 12 * 1024 * 1024
const SCENARIOS: readonly RecognizeStatus[] = ['matched', 'low_confidence', 'not_found']

/** Сигнатуры форматов: JPEG, PNG, GIF, WebP (RIFF…WEBP), HEIC/AVIF (ftyp). */
function looksLikeImage(data: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to))
  if (data[0] === 0xff && data[1] === 0xd8) return true
  if (data[0] === 0x89 && ascii(1, 4) === 'PNG') return true
  if (ascii(0, 3) === 'GIF') return true
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true
  return ascii(4, 8) === 'ftyp'
}

/**
 * Распознавание этикетки для интерфейса: снимок → карточка вина в JSON с кандидатами,
 * метриками уверенности и аналогами. Тот же multipart-контракт (поле image), что
 * у /api/v1/eval/predict, но ответ полный — шторке результата не нужен второй запрос.
 *
 * Пока CV-модели нет, работает только демо-режим; без него — честный 503,
 * который интерфейс показывает как «распознавание ещё не подключено».
 */
export default defineEventHandler(async (event): Promise<RecognizeResult> => {
  const form = await readMultipartFormData(event)
  const image = form?.find((part) => part.name === 'image')
  if (!image?.data?.length) {
    throw createError({
      statusCode: 400,
      message: 'Ожидается multipart/form-data с непустым полем image',
    })
  }
  if (image.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'Фото больше 12 МБ' })
  }
  // Заголовку типа не верим: curl шлёт .webp как application/octet-stream.
  if (!looksLikeImage(image.data)) {
    throw createError({
      statusCode: 415,
      message: 'Ожидается изображение JPEG, PNG, WebP или HEIC',
    })
  }

  const { public: config } = useRuntimeConfig(event)
  if (config.demoScan !== true) {
    throw createError({
      statusCode: 503,
      message: 'Распознавание этикеток ещё не подключено',
      data: { reason: 'not_implemented' },
    })
  }

  const raw = form?.find((part) => part.name === 'scenario')?.data.toString('utf8') ?? ''
  const scenario = SCENARIOS.find((value) => value === raw) ?? null
  return demoRecognize(image.data, scenario)
})
