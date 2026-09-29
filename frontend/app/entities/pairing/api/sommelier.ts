import { API } from '@/shared/config/api'

import { advise, verdictFor } from '../lib/engine'
import type { FoodGroupId, SommelierAnswer, SommelierService } from '../model/types'

/**
 * Сомелье для интерфейса. Совет к карточке и вердикт по чипу считаются на месте —
 * мгновенно и без сети; подбор «Лучше подойдут» идёт на бэкенд, потому что
 * требует всего каталога. Если на сервере подключена LLM, ответ ask() придёт от неё
 * в той же форме — компоненты этого не заметят.
 */
export const sommelier: SommelierService = {
  advise,
  verdict: verdictFor,
  ask(slug: string, group: FoodGroupId, signal?: AbortSignal): Promise<SommelierAnswer> {
    return $fetch<SommelierAnswer>(API.sommelier, {
      method: 'POST',
      body: { slug, food: group },
      signal,
    })
  },
}
