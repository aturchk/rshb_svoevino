import { assertAnnotationEnabled, openReferenceImage } from '../../../utils/annotation-store'

export default defineEventHandler(async (event) => {
  assertAnnotationEnabled(event)
  const slug = getRouterParam(event, 'slug') ?? ''
  const image = await openReferenceImage(slug)
  setResponseHeader(event, 'content-type', image.mimeType)
  setResponseHeader(event, 'cache-control', 'private, max-age=3600')
  return sendStream(event, image.stream)
})
