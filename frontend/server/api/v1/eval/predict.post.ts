/**
 * Эндпоинт скрипта оценки кейсодержателя.
 *
 * Контракт (eval/participant_test.sh): принимает multipart/form-data с полем
 * `image`, возвращает плоский JSON с одним лучшим результатом: {"slug":"..."}.
 * Скрипт сам замеряет время ответа; при любом не-200 он записывает null,
 * что для нерешённой задачи честнее выдуманного слага.
 *
 * TODO: подключить CV-пайплайн — нормализация фото, эмбеддинг, поиск по индексу.
 * Форма ответа при этом не меняется, меняется только тело обработчика.
 */
export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const image = form?.find((part) => part.name === 'image')

  if (!image?.data?.length) {
    throw createError({
      statusCode: 400,
      message: 'Ожидается multipart/form-data с непустым полем image',
    })
  }

  throw createError({
    statusCode: 503,
    message: 'Распознавание этикеток ещё не реализовано',
    data: {
      slug: null,
      reason: 'not_implemented',
      receivedBytes: image.data.length,
    },
  })
})
