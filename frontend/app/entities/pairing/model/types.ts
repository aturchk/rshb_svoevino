import type { SimilarWine } from '@/entities/wine'

/**
 * Цифровой сомелье: типы. Всё, что выдаёт этот срез, — рекомендация по правилам,
 * а не факт каталога: в дампе «Своего Вина» гастропар нет. Поэтому в интерфейсе
 * результат всегда помечен «Рекомендация сомелье», а дословная фраза винодельни
 * (WineDetailFile.pairingNote) показывается отдельно.
 */

export type FoodGroupId =
  'meat' | 'fish' | 'cheese' | 'pasta' | 'dessert' | 'veg' | 'spicy' | 'snack'

export type FoodId =
  | 'meat_red'
  | 'meat_game'
  | 'meat_poultry'
  | 'meat_pork'
  | 'meat_shashlik'
  | 'fish_white'
  | 'fish_fatty'
  | 'fish_seafood'
  | 'cheese_fresh'
  | 'cheese_hard'
  | 'cheese_blue'
  | 'pasta_tomato'
  | 'pasta_cream'
  | 'dessert_fruit'
  | 'dessert_choc'
  | 'veg_salad'
  | 'veg_mushroom'
  | 'spicy_hot'
  | 'asian'
  | 'snack_aperitif'
  | 'snack_fried'
  | 'snack_charcuterie'

export interface Food {
  id: FoodId
  group: FoodGroupId
  label: string
  emoji: string
}

export interface FoodGroup {
  id: FoodGroupId
  label: string
  emoji: string
  foods: readonly FoodId[]
}

/**
 * Профиль стиля: строка таблицы сочетаний. Выводится из категории, сахара,
 * игристости, креплёности, крепости (как прокси тела), дуба и сортов.
 */
export type StyleKey =
  | 'red_full'
  | 'red_medium'
  | 'red_light'
  | 'white_light'
  | 'white_full'
  | 'rose'
  | 'orange'
  | 'sparkling_dry'
  | 'sparkling_offdry'
  | 'sparkling_sweet'
  | 'still_offdry'
  | 'still_semisweet'
  | 'sweet'
  | 'dessert_fortified_white'
  | 'dessert_fortified_red'
  | 'fortified_dry'
  | 'sparkling_red'
  | 'red_offdry'

/** Всё, что правилам нужно знать о вине. Есть и в карточке, и в индексе каталога. */
export interface PairingTraits {
  /** Название: херес и мадера без указания сахара — сухое креплёное, а не десертное. */
  name: string
  category: string
  style: string | null
  sparkling: boolean
  fortified: boolean
  oak: boolean
  /** Сахар не указан, но описание называет вино сладким или десертным. */
  sweetHint: boolean
  abv: number | null
  /** канонические сорта */
  grapes: readonly string[]
}

export interface FoodScore {
  food: Food
  /** от −3 (плохое сочетание) до +4 (отличная пара с поддержкой сорта) */
  score: number
  reason: string
}

export type PairingLevel = 'great' | 'good'

export interface Pairing {
  food: Food
  level: PairingLevel
  reason: string
}

export interface Serving {
  temperature: string
  glass: string
  tip: string | null
}

export interface PairingAdvice {
  styleKey: StyleKey
  /** «Плотное сухое красное» — как правила поняли вино */
  profile: string
  pairings: Pairing[]
  serving: Serving
}

export type VerdictLevel = 'great' | 'good' | 'ok' | 'poor'

export interface FoodVerdict {
  group: FoodGroupId
  level: VerdictLevel
  title: string
  best: FoodScore | null
  /** Внутри группы бывает и то и другое: «к птице — да, к стейку — нет». */
  caveat: FoodScore | null
  /** Подобрать вина, которые подойдут лучше: вердикт «можно» или «не лучший выбор». */
  suggestAlternatives: boolean
}

export interface SommelierAnswer {
  verdict: FoodVerdict
  alternatives: SimilarWine[]
  /** Кто ответил: правила или подключённая LLM. */
  source: 'rules' | 'llm'
}

/**
 * Шов под LLM. Сейчас реализация на правилах (lib/engine.ts) — синхронная, без сети,
 * поэтому карточка рендерится на сервере сразу с советом. LLM подключается
 * через серверный эндпоинт POST /api/v1/sommelier (server/utils/sommelier.ts):
 * клиент при этом не меняется — ответ приходит в той же форме SommelierAnswer.
 */
export interface SommelierService {
  advise(wine: PairingTraits): PairingAdvice
  verdict(wine: PairingTraits, group: FoodGroupId): FoodVerdict
  ask(slug: string, group: FoodGroupId, signal?: AbortSignal): Promise<SommelierAnswer>
}
