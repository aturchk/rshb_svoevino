/** Expose frozen ML identity through the same local frontend used for evaluation. */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    const response = await fetch(`${config.ml.baseUrl.replace(/\/$/, '')}/v1/metadata`, {
      signal: AbortSignal.timeout(Number(config.ml.timeoutMs)),
    })
    if (!response.ok) throw new Error(`ML metadata request failed: ${response.status}`)
    return await response.json()
  }
  catch (cause: unknown) {
    throw createError({ statusCode: 502, message: 'ML-сервис недоступен', cause })
  }
})
