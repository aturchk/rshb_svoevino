import { API } from '@/shared/config/api'

import type { DemoScenario, RecognizeResult } from '../model/types'

/** Сервис распознавания не подключён или недоступен — это не «вино не найдено». */
export class RecognizeUnavailableError extends Error {
  constructor(message = 'Распознавание этикеток пока не подключено') {
    super(message)
    this.name = 'RecognizeUnavailableError'
  }
}

/**
 * Отправка снимка на распознавание: POST multipart/form-data, поле image —
 * тот же контракт, что у эндпоинта скрипта оценки. Выше по стеку ничего не знает
 * о том, чем считается эмбеддинг: демо-режимом, SigLIP на CPU или GPU.
 */
export async function recognizeWine(
  image: Blob,
  options: { signal?: AbortSignal; scenario?: DemoScenario } = {},
): Promise<RecognizeResult> {
  const form = new FormData()
  form.append('image', image, 'label.jpg')
  if (options.scenario && options.scenario !== 'auto') form.append('scenario', options.scenario)
  try {
    return await $fetch<RecognizeResult>(API.recognize, {
      method: 'POST',
      body: form,
      signal: options.signal,
    })
  } catch (cause: unknown) {
    const status = (cause as { statusCode?: number } | null)?.statusCode
    if (status === 503) throw new RecognizeUnavailableError()
    throw cause
  }
}
