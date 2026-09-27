import type {
  FoodGroupId,
  FoodScore,
  FoodVerdict,
  Pairing,
  PairingAdvice,
  PairingTraits,
  Serving,
  StyleKey,
  VerdictLevel,
} from '../model/types'
import { FOOD_ORDER, FOODS, foodGroup } from './foods'
import type { GrapeRule, ServingRule } from './knowledge'
import {
  GRAPE_FAMILIES,
  GRAPES,
  RED_SWEETISH_SERVING,
  SERVING,
  STYLE_PROFILE,
  STYLE_TABLE,
} from './knowledge'

/**
 * Движок сомелье на правилах. Чистые функции: одинаково работают при серверном
 * рендере карточки, в браузере на тап по чипу и в тестах.
 */

/** Бонус сорта: конкретная пара из таблицы сортов точнее общего правила стиля. */
const GRAPE_BONUS = 1
const MAX_PAIRINGS = 6
const MIN_PAIRINGS = 3
const MAX_PER_GROUP = 2
const NEUTRAL = 'Нейтральное сочетание: вино не испортит блюдо, но и не раскроет его'

const normalize = (value: string): string => value.toLowerCase().replace(/ё/g, 'е')

const GRAPE_LOOKUP = new Map<string, GrapeRule>(
  Object.entries(GRAPES).map(([name, rule]) => [normalize(name), rule]),
)
// Без уточнения «Красностоп» в каталоге — почти всегда Золотовский (донской).
GRAPE_LOOKUP.set('красностоп', GRAPES['Красностоп Золотовский'] as GrapeRule)

export function grapeRule(grape: string): GrapeRule | null {
  const key = normalize(grape)
  const exact = GRAPE_LOOKUP.get(key)
  if (exact) return exact
  return GRAPE_FAMILIES.find(([prefix]) => key.startsWith(prefix))?.[1] ?? null
}

/** Все известные правилам сорта вина. */
function grapeRules(traits: PairingTraits): GrapeRule[] {
  return traits.grapes.map(grapeRule).filter((rule): rule is GrapeRule => rule !== null)
}

/**
 * Сорт, чья конкретика относится к этой бутылке: моносорт того же цвета, что и ягода.
 * У купажа доля сорта неизвестна, а у розового или белого из Пино Нуар нет
 * «лёгких танинов красного» — там решает строка стиля.
 */
function varietalRule(traits: PairingTraits): GrapeRule | null {
  if (traits.grapes.length !== 1) return null
  const rule = grapeRule(traits.grapes[0] as string)
  if (!rule) return null
  const wineColor = traits.category === 'Красное' ? 'red' : traits.category === 'Розовое' ? 'rose' : 'white'
  return rule.color === undefined || rule.color === wineColor ? rule : null
}

const DRY_FORTIFIED_NAME = /херес|мадер|солера|solera|heres|madera/i

const SWEET_STYLES: ReadonlySet<StyleKey> = new Set([
  'sparkling_sweet',
  'still_semisweet',
  'sweet',
  'dessert_fortified_white',
  'dessert_fortified_red',
])

/**
 * Строка таблицы для вина. Порядок проверок важен: креплёность и игристость
 * определяют стиль сильнее цвета, сахар — сильнее тела.
 * Сахар не указан (18% каталога) — считаем вино сухим: так устроено 57% каталога,
 * и это самое осторожное допущение для пар.
 */
export function styleKeyOf(traits: PairingTraits): StyleKey {
  const { category, style, sparkling, fortified, oak, abv } = traits
  const red = category === 'Красное'

  if (fortified) {
    if (style === 'Сухое' || style === 'Полусухое') return 'fortified_dry'
    // Херес и мадера без указания сахара — сухие креплёные, а не десертные.
    if (style === null && DRY_FORTIFIED_NAME.test(traits.name)) return 'fortified_dry'
    return red ? 'dessert_fortified_red' : 'dessert_fortified_white'
  }

  if (sparkling) {
    if (style === 'Полусладкое' || style === 'Сладкое') return 'sparkling_sweet'
    // Красное игристое — со своей строкой: танины тянут его к мясу, а не к устрицам.
    if (red) return 'sparkling_red'
    // По ГОСТ «сухое» игристое (15–25 г/л) слаще брюта.
    if (style === 'Полусухое' || style === 'Сухое') return 'sparkling_offdry'
    return 'sparkling_dry'
  }

  if (style === 'Сладкое' || (style === null && traits.sweetHint)) return 'sweet'
  if (style === 'Полусладкое') return 'still_semisweet'
  if (style === 'Полусухое') return red ? 'red_offdry' : 'still_offdry'

  const rules = grapeRules(traits)
  if (category === 'Оранжевое') return 'orange'
  if (category === 'Розовое') return 'rose'

  if (red) {
    const tannin = Math.max(0, ...rules.map((rule) => rule.tannin ?? 0))
    const allLight = rules.length > 0 && rules.every((rule) => rule.light === true)
    if (abv !== null && abv >= 13.5 && !allLight) return 'red_full'
    if (tannin === 3) return 'red_full'
    // Низкий алкоголь — лёгкое, только если сорт не танинный: 11% Одесского чёрного — не Пино.
    const lowAlcohol = abv !== null && abv < 11.5 && (rules.length === 0 || tannin <= 1)
    if (lowAlcohol || (allLight && (abv === null || abv < 14))) return 'red_light'
    return 'red_medium'
  }

  const full = rules.some((rule) => rule.full === true)
  if (oak || full || (abv !== null && abv >= 13.5)) return 'white_full'
  return 'white_light'
}

/** Стили, где сорт определяет пары: тихие вина. У игристого и креплёного решает стиль. */
const GRAPE_DRIVEN_EXCLUDED: ReadonlySet<StyleKey> = new Set([
  'sparkling_dry',
  'sparkling_offdry',
  'sparkling_sweet',
  'sparkling_red',
  'fortified_dry',
])

/** Оценка одной пары: правило стиля плюс, если не конфликт, конкретика сорта. */
function scoreWith(styleKey: StyleKey, rule: GrapeRule | null, foodId: keyof typeof FOODS) {
  const [base, styleReason] = STYLE_TABLE[styleKey][foodId] ?? [0, NEUTRAL]
  if (GRAPE_DRIVEN_EXCLUDED.has(styleKey) || !rule) return { score: base, reason: styleReason }
  const sweet = SWEET_STYLES.has(styleKey)
  const grapeReason = (sweet ? rule.sweet : rule.dry)?.[foodId] ?? null
  // Сорт не спасает плохое сочетание: полусладкое Саперави к стейку — всё равно нет.
  if (grapeReason && base >= 0) {
    return { score: base + GRAPE_BONUS, reason: grapeReason }
  }
  return { score: base, reason: styleReason }
}

export function scoreFoods(traits: PairingTraits): FoodScore[] {
  const styleKey = styleKeyOf(traits)
  const rule = varietalRule(traits)
  return FOOD_ORDER.map((id) => ({ food: FOODS[id], ...scoreWith(styleKey, rule, id) }))
}

function formatServing(rule: ServingRule): Serving {
  const [from, to] = rule.temperature
  return { temperature: `${from}–${to} °C`, glass: rule.glass, tip: rule.tip }
}

export function servingOf(traits: PairingTraits): Serving {
  const styleKey = styleKeyOf(traits)
  let rule = SERVING[styleKey]
  if (
    traits.category === 'Красное' &&
    (styleKey === 'still_offdry' || styleKey === 'still_semisweet')
  ) {
    rule = RED_SWEETISH_SERVING
  }
  // Уточнение сорта — только для сухого тихого моносорта: у игристого, десертного
  // и выдержанного в дубе белого своя подача, а у купажа сорт не главный.
  const varietal = varietalRule(traits)
  const plain = !SWEET_STYLES.has(styleKey) && !traits.sparkling && !traits.fortified
  if (plain && styleKey !== 'white_full' && varietal?.serving) {
    rule = { ...rule, ...varietal.serving }
  }
  return formatServing(rule)
}

/**
 * Совет к карточке: 3–6 лучших пар, не больше двух из одной группы блюд —
 * иначе у каберне все шесть строк будут про мясо.
 */
export function advise(traits: PairingTraits): PairingAdvice {
  const styleKey = styleKeyOf(traits)
  const ranked = scoreFoods(traits)
    .map((item, order) => ({ item, order }))
    .sort((a, b) => b.item.score - a.item.score || a.order - b.order)
    .map(({ item }) => item)

  const pairings: Pairing[] = []
  const perGroup = new Map<FoodGroupId, number>()
  const take = (minScore: number) => {
    for (const item of ranked) {
      if (pairings.length >= MAX_PAIRINGS) return
      if (item.score < minScore || pairings.some((pairing) => pairing.food.id === item.food.id)) {
        continue
      }
      const count = perGroup.get(item.food.group) ?? 0
      if (count >= MAX_PER_GROUP) continue
      perGroup.set(item.food.group, count + 1)
      pairings.push({
        food: item.food,
        level: item.score >= 3 ? 'great' : 'good',
        reason: item.reason,
      })
    }
  }
  take(2)
  if (pairings.length < MIN_PAIRINGS) take(1)

  // Сахар не указан — не пишем «сухое»: правила лишь считают такое вино сухим.
  const profile =
    traits.style === null && !traits.sweetHint
      ? STYLE_PROFILE[styleKey].replace(/\s?сухое\s?/i, ' ').trim().replace(/^./, (c) => c.toUpperCase())
      : STYLE_PROFILE[styleKey]

  return {
    styleKey,
    profile,
    pairings,
    serving: servingOf(traits),
  }
}

const TITLES: Readonly<Record<VerdictLevel, string>> = {
  great: 'Отличная пара',
  good: 'Хорошо подойдёт',
  ok: 'Можно, но есть пары удачнее',
  poor: 'Не лучший выбор',
}

function levelOf(score: number): VerdictLevel {
  if (score >= 3) return 'great'
  if (score >= 2) return 'good'
  if (score >= 0) return 'ok'
  return 'poor'
}

/** Ответ на «Что у вас на ужин?»: лучшая пара в группе и честное предупреждение. */
export function verdictFor(traits: PairingTraits, groupId: FoodGroupId): FoodVerdict {
  const group = foodGroup(groupId)
  const scores = scoreFoods(traits).filter((item) => group.foods.includes(item.food.id))
  if (scores.length === 0) {
    return {
      group: groupId,
      level: 'ok',
      title: TITLES.ok,
      best: null,
      caveat: null,
      suggestAlternatives: false,
    }
  }
  const byGroupOrder = (id: string) => group.foods.indexOf(id as never)
  const sorted = [...scores].sort(
    (a, b) => b.score - a.score || byGroupOrder(a.food.id) - byGroupOrder(b.food.id),
  )
  const best = sorted[0] as FoodScore
  const worst = sorted[sorted.length - 1] as FoodScore
  const level = levelOf(best.score)
  // Предупреждение, когда в группе есть плохая пара, а лучшая — не плохая: «к свинине
  // можно, а вот к стейку — нет». Если плохо всё, вердикт уже это говорит — не повторяем.
  const caveat = worst !== best && worst.score <= -2 && best.score >= 0 ? worst : null
  return {
    group: groupId,
    level,
    title: TITLES[level],
    best,
    caveat,
    suggestAlternatives: level === 'ok' || level === 'poor',
  }
}

/** Лучшая оценка вина для группы блюд — для подбора «Лучше подойдут» по каталогу. */
export function bestForGroup(traits: PairingTraits, groupId: FoodGroupId): FoodScore | null {
  const group = foodGroup(groupId)
  let best: FoodScore | null = null
  for (const item of scoreFoods(traits)) {
    if (!group.foods.includes(item.food.id)) continue
    if (!best || item.score > best.score) best = item
  }
  return best
}
