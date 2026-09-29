/** Expose frozen ML identity through the same local frontend used for evaluation. */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    return await $fetch(`${config.ml.baseUrl.replace(/\/$/, '')}/v1/metadata`, {
      timeout: Number(config.ml.timeoutMs),
    })
  }
  catch (cause: unknown) {
    throw createError({ statusCode: 502, message: 'ML-сервис недоступен', cause })
  }
})
