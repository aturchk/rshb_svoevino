import type { WineDetailFile } from '@/shared/config/dataset-schema'
import { wineFile } from '@/shared/config/dataset-schema'

/**
 * Карточка вина. Файл денормализован, поэтому прямой заход на /wine/:slug —
 * ровно один запрос, без индекса и без справочников. Работает и на сервере:
 * страница вина отдаётся отрендеренной.
 */
export function loadWine(slug: string): Promise<WineDetailFile> {
  return $fetch<WineDetailFile>(`/${wineFile(slug)}`)
}
