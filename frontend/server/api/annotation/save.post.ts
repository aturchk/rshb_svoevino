import type { SaveAnnotationInput } from '../../utils/annotation-store'
import { assertAnnotationEnabled, saveAnnotation } from '../../utils/annotation-store'

export default defineEventHandler(async (event) => {
  assertAnnotationEnabled(event)
  const input = await readBody<SaveAnnotationInput>(event)
  return saveAnnotation(input)
})
