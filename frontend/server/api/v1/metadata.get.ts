/** Expose frozen ML identity through the same local frontend used for evaluation. */
export default defineEventHandler(async (event): Promise<unknown> => {
  const config = useRuntimeConfig(event)
  try {
    const url: string = `${config.ml.baseUrl.replace(/\/$/, '')}/v1/metadata`
    return await $fetch<unknown>(url, {
      timeout: Number(config.ml.timeoutMs),
    })
  }
  catch (cause: unknown) {
    throw createError({ statusCode: 502, message: 'ML-сервис недоступен', cause })
  }
})
