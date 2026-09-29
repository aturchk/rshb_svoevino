import { assertAnnotationEnabled, readAnnotationState } from '../../utils/annotation-store'

export default defineEventHandler(async (event) => {
  assertAnnotationEnabled(event)
  return readAnnotationState()
})
