import { scoreFoods, verdictFor } from '@/entities/pairing/lib/engine'
import { FOODS, foodGroup } from '@/entities/pairing/lib/foods'
import type {
  FoodGroupId,
  FoodId,
  PairingTraits,
  SommelierAnswer,
} from '@/entities/pairing/model/types'
import { summarize } from '@/entities/wine/lib/summary'
import type { SimilarWine, WineIndex } from '@/entities/wine/model/types'
import { STYLE_UNKNOWN } from '@/entities/wine/model/types'

import { useCatalog } from './catalog'

/**
 * Серверная сторона цифрового сомелье — место, куда подключается LLM.
 *
 * Сейчас работает бэкенд на правилах: вердикт тем же движком, что и в браузере,
 * плюс подбор вин из каталога, которые подойдут к блюду лучше. LLM включается
 * через runtimeConfig.sommelier (NUXT_SOMMELIER_PROVIDER=llm и адрес модели):
 * она получает вино, блюдо и кандидатов из каталога и возвращает тот же
 * SommelierAnswer. Кандидатов по-прежнему даёт каталог — модель выбирает и
 * объясняет, но не выдумывает вина, которых нет.
 */
export interface SommelierBackend {
  answer(slug: string, group: FoodGroupId): Promise<SommelierAnswer | null>
}

const ALTERNATIVES = 3
const GREAT = 3

export function pairingTraitsAt(index: WineIndex, id: number): PairingTraits {
  const style = index.style[id] as number
  const abv = index.abv[id] as number
  return {
    name: index.names[id] as string,
    category: index.dict.categories[index.category[id] as number] ?? '',
    style: style === STYLE_UNKNOWN ? null : (index.dict.styles[style] ?? null),
    sparkling: index.sparkling[id] === 1,
    fortified: index.fortified[id] === 1,
    oak: index.oak[id] === 1,
    sweetHint: index.sweetHint[id] === 1,
    abv: Number.isNaN(abv) ? null : Math.round(abv * 10) / 10,
    grapes: (index.grapeKeys[id] ?? []).map((key) => index.dict.grapeKeys[key] ?? ''),
  }
}

/**
 * Вина каталога, которые к этой группе блюд — «отличная пара». Подбор идёт по кругу
 * блюд группы: к рыбе — одно к белой рыбе, одно к лососю, одно к устрицам, а не три
 * шардоне к лососю. Среди равных выше те, что ближе к исходному вину (тот же регион,
 * похожая крепость): человек выбрал бутылку не случайно. По одному вину на винодельню.
 */
export function rankForGroup(
  index: WineIndex,
  sourceId: number,
  group: FoodGroupId,
  limit = ALTERNATIVES,
): SimilarWine[] {
  const foods = foodGroup(group).foods
  const sourceAbv = index.abv[sourceId] as number
  type Candidate = { id: number; rank: number; reason: string }
  const byFood = new Map<FoodId, Candidate[]>(foods.map((food) => [food, []]))

  for (let id = 0; id < index.count; id++) {
    if (id === sourceId) continue
    const abv = index.abv[id] as number
    const closeness =
      (index.region[id] === index.region[sourceId] ? 0.3 : 0) +
      (Number.isNaN(abv) || Number.isNaN(sourceAbv)
        ? 0
        : Math.max(0, 0.2 - Math.abs(abv - sourceAbv) * 0.05)) +
      (index.hasImage[id] === 1 ? 0.15 : 0) +
      ((id * 7919) % 97) / 10000
    for (const item of scoreFoods(pairingTraitsAt(index, id))) {
      if (item.score < GREAT) continue
      byFood.get(item.food.id)?.push({ id, rank: item.score + closeness, reason: item.reason })
    }
  }
  for (const list of byFood.values()) list.sort((a, b) => b.rank - a.rank)

  const picked: SimilarWine[] = []
  const used = new Set<number>()
  const wineries = new Set<number>([index.winery[sourceId] as number])
  const cursor = new Map<FoodId, number>()
  let progressed = true
  while (picked.length < limit && progressed) {
    progressed = false
    for (const food of foods) {
      if (picked.length >= limit) break
      const list = byFood.get(food) ?? []
      let position = cursor.get(food) ?? 0
      while (position < list.length) {
        const candidate = list[position++] as Candidate
        const winery = index.winery[candidate.id] as number
        if (used.has(candidate.id) || wineries.has(winery)) continue
        used.add(candidate.id)
        wineries.add(winery)
        const reason = `${candidate.reason.charAt(0).toLowerCase()}${candidate.reason.slice(1)}`
        picked.push({
          ...summarize(index, candidate.id),
          reasons: [`${FOODS[food].label}: ${reason}`],
        })
        progressed = true
        break
      }
      cursor.set(food, position)
    }
  }
  return picked
}

export const rulesSommelier: SommelierBackend = {
  async answer(slug, group) {
    const { index, idBySlug } = await useCatalog()
    const id = idBySlug.get(slug)
    if (id === undefined) return null
    const verdict = verdictFor(pairingTraitsAt(index, id), group)
    const alternatives = verdict.suggestAlternatives ? rankForGroup(index, id, group) : []
    return { verdict, alternatives, source: 'rules' }
  },
}

/**
 * Точка подключения LLM. Не реализована сознательно: без ключа и модели любой код
 * здесь был бы имитацией. Пока провайдер не настроен, отвечают правила —
 * интерфейс не ломается ни при какой конфигурации.
 */
export function useSommelierBackend(): SommelierBackend {
  const { sommelier } = useRuntimeConfig()
  if (sommelier.provider === 'llm' && sommelier.llmEndpoint) {
    console.warn('[sommelier] LLM-провайдер настроен, но ещё не реализован — отвечают правила')
  }
  return rulesSommelier
}
