import type { Food, FoodGroup, FoodGroupId, FoodId } from '../model/types'

/**
 * Таксономия блюд. Группы — это чипы «Что у вас на ужин?», блюда внутри —
 * то, с чем правила сравнивают вино. Эмодзи вместо картинок: ноль байт трафика,
 * и на обеих мобильных платформах они узнаются с первого взгляда.
 */
export const FOODS: Readonly<Record<FoodId, Food>> = {
  meat_red: { id: 'meat_red', group: 'meat', label: 'Стейк и красное мясо', emoji: '🥩' },
  meat_game: { id: 'meat_game', group: 'meat', label: 'Дичь и утка', emoji: '🦆' },
  meat_poultry: { id: 'meat_poultry', group: 'meat', label: 'Курица и индейка', emoji: '🍗' },
  meat_pork: { id: 'meat_pork', group: 'meat', label: 'Свинина', emoji: '🍖' },
  meat_shashlik: { id: 'meat_shashlik', group: 'meat', label: 'Шашлык и гриль', emoji: '🍢' },
  fish_white: { id: 'fish_white', group: 'fish', label: 'Белая рыба', emoji: '🐟' },
  fish_fatty: { id: 'fish_fatty', group: 'fish', label: 'Лосось и жирная рыба', emoji: '🍣' },
  fish_seafood: {
    id: 'fish_seafood',
    group: 'fish',
    label: 'Устрицы и морепродукты',
    emoji: '🦪',
  },
  cheese_fresh: {
    id: 'cheese_fresh',
    group: 'cheese',
    label: 'Свежие и мягкие сыры',
    emoji: '🥛',
  },
  cheese_hard: { id: 'cheese_hard', group: 'cheese', label: 'Выдержанные сыры', emoji: '🧀' },
  cheese_blue: { id: 'cheese_blue', group: 'cheese', label: 'Сыр с голубой плесенью', emoji: '🫐' },
  pasta_tomato: {
    id: 'pasta_tomato',
    group: 'pasta',
    label: 'Паста и пицца с томатом',
    emoji: '🍕',
  },
  pasta_cream: { id: 'pasta_cream', group: 'pasta', label: 'Паста в сливочном соусе', emoji: '🍝' },
  dessert_fruit: {
    id: 'dessert_fruit',
    group: 'dessert',
    label: 'Фруктовые десерты',
    emoji: '🍓',
  },
  dessert_choc: { id: 'dessert_choc', group: 'dessert', label: 'Шоколад', emoji: '🍫' },
  veg_salad: { id: 'veg_salad', group: 'veg', label: 'Салаты и свежие овощи', emoji: '🥗' },
  veg_mushroom: { id: 'veg_mushroom', group: 'veg', label: 'Грибы и овощи гриль', emoji: '🍄' },
  spicy_hot: { id: 'spicy_hot', group: 'spicy', label: 'Острое: чили, карри', emoji: '🌶️' },
  asian: { id: 'asian', group: 'spicy', label: 'Суши и азиатская кухня', emoji: '🥢' },
  snack_aperitif: {
    id: 'snack_aperitif',
    group: 'snack',
    label: 'Аперитив: оливки, орехи',
    emoji: '🫒',
  },
  snack_fried: { id: 'snack_fried', group: 'snack', label: 'Жареное и фритюр', emoji: '🍟' },
  snack_charcuterie: {
    id: 'snack_charcuterie',
    group: 'snack',
    label: 'Мясные закуски',
    emoji: '🥓',
  },
}

export const FOOD_ORDER: readonly FoodId[] = Object.keys(FOODS) as FoodId[]

/** Чипы вопроса «Что у вас на ужин?» — в порядке частоты ужинов, а не алфавита. */
export const FOOD_GROUPS: readonly FoodGroup[] = [
  {
    id: 'meat',
    label: 'Мясо',
    emoji: '🥩',
    foods: ['meat_red', 'meat_shashlik', 'meat_pork', 'meat_poultry', 'meat_game'],
  },
  { id: 'fish', label: 'Рыба', emoji: '🐟', foods: ['fish_white', 'fish_fatty', 'fish_seafood'] },
  {
    id: 'cheese',
    label: 'Сыр',
    emoji: '🧀',
    foods: ['cheese_hard', 'cheese_fresh', 'cheese_blue'],
  },
  { id: 'pasta', label: 'Паста', emoji: '🍝', foods: ['pasta_tomato', 'pasta_cream'] },
  { id: 'dessert', label: 'Десерт', emoji: '🍰', foods: ['dessert_fruit', 'dessert_choc'] },
  { id: 'veg', label: 'Овощи', emoji: '🥗', foods: ['veg_salad', 'veg_mushroom'] },
  { id: 'spicy', label: 'Острое', emoji: '🌶️', foods: ['spicy_hot', 'asian'] },
]

/** Закуски в чипы не выносим, но в список пар к вину они попадают. */
export const SNACK_GROUP: FoodGroup = {
  id: 'snack',
  label: 'Закуски',
  emoji: '🫒',
  foods: ['snack_aperitif', 'snack_fried', 'snack_charcuterie'],
}

export function foodGroup(id: FoodGroupId): FoodGroup {
  return FOOD_GROUPS.find((group) => group.id === id) ?? SNACK_GROUP
}

export function isFoodGroupId(value: unknown): value is FoodGroupId {
  return (
    typeof value === 'string' &&
    (FOOD_GROUPS.some((group) => group.id === value) || value === SNACK_GROUP.id)
  )
}
