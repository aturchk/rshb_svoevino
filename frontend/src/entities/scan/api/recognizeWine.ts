import type { RecognizeResult } from '../model/types'

/**
 * Шов под будущий ML-сервис.
 *
 * TODO: заменить тело на POST multipart/form-data на /v1/eval/predict.
 * Сигнатура и форма ответа менять не должны: выше по стеку ничего не знает
 * о том, считается ли эмбеддинг локально или на сервере.
 *
 * Сейчас это заглушка — распознавания в MVP нет by design.
 */
export async function recognizeWine(
  image: Blob,
  signal?: AbortSignal,
): Promise<RecognizeResult> {
  void image
  void signal
  return Promise.resolve({
    status: 'not_found',
    top1: null,
    top5: [],
    latencyMs: 0,
  })
}
