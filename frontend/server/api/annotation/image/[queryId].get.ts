import { assertAnnotationEnabled, openQueryImage } from '../../../utils/annotation-store'

export default defineEventHandler(async (event) => {
  assertAnnotationEnabled(event)
  const queryId = getRouterParam(event, 'queryId') ?? ''
  const image = await openQueryImage(queryId)
  setResponseHeader(event, 'content-type', image.mimeType)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  return sendStream(event, image.stream)
})
