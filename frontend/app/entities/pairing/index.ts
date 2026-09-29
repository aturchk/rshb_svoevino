export type {
  Food,
  FoodGroup,
  FoodGroupId,
  FoodId,
  FoodScore,
  FoodVerdict,
  Pairing,
  PairingAdvice,
  PairingLevel,
  PairingTraits,
  Serving,
  SommelierAnswer,
  SommelierService,
  StyleKey,
  VerdictLevel,
} from './model/types'
export { FOOD_GROUPS, FOODS, foodGroup, isFoodGroupId } from './lib/foods'
export { advise, bestForGroup, scoreFoods, servingOf, styleKeyOf, verdictFor } from './lib/engine'
export { pairingTraitsOf } from './lib/traits'
