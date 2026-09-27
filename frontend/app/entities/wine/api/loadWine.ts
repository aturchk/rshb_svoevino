import { API } from '@/shared/config/api'

import type { WineCard } from '../model/types'

/**
 * Карточка вина с похожими винами — один запрос к бэкенду. Работает и на сервере:
 * страница вина отдаётся отрендеренной.
 */
export function loadWine(slug: string): Promise<WineCard> {
  return $fetch<WineCard>(API.wine(slug))
}
