import type { FoodId, StyleKey } from '../model/types'

/**
 * База правил сочетания вина и еды. Прозрачная: каждая оценка — строка таблицы
 * с объяснением, которое видит пользователь. Опирается на общепринятые принципы
 * (WSET, Wine Folly, рекомендации Роскачества по подаче):
 *  - танины смягчаются белком и жиром, но с рыбой дают металлический привкус;
 *  - кислотность освежает жирное и держит кислое блюдо;
 *  - вино должно быть слаще десерта;
 *  - сладость гасит остроту, а алкоголь и танины её разжигают;
 *  - вес к весу: лёгкое вино теряется рядом с насыщенным блюдом;
 *  - пузырьки очищают нёбо от соли и масла.
 *
 * Шкала: 3 — отличная пара, 2 — хорошо подойдёт, 0 — можно (не указывается),
 * −1…−2 — не лучший выбор, −3 — плохое сочетание.
 */

export type Cell = readonly [score: number, reason: string]

const TANNIN_FISH = 'Танины с рыбой дают металлический привкус'
const TANNIN_HEAT = 'Танины и острота вместе дают горечь и жжение'
const ALCOHOL_HEAT = 'Крепкое вино разжигает остроту ещё сильнее'
const DRY_DESSERT = 'Вино должно быть слаще десерта — иначе покажется кислым и горьким'
const CHOCOLATE = 'Шоколад заглушит вино и сделает его кислым'
const LIGHT_HEAVY = 'Лёгкое вино потеряется на фоне насыщенного мяса'
const VINEGAR_RED = 'Уксусная заправка делает красное вино плоским'
const BLUE_LIGHT = 'Голубой сыр заглушит лёгкое вино'
const SWEET_SAVORY = 'Сладость спорит с мясным и солёным вкусом'
const DESSERT_MAIN = 'Десертное вино подавит основное блюдо — оставьте его к десерту'
const NEEDS_TANNIN = 'Стейку нужны танины и плотность, которых этому вину не хватает'

export const STYLE_TABLE: Readonly<Record<StyleKey, Partial<Record<FoodId, Cell>>>> = {
  red_full: {
    meat_red: [3, 'Танины смягчаются белком и жиром мяса — вино станет бархатистее'],
    meat_shashlik: [3, 'Плотное вино выдержит дымок углей и маринад'],
    meat_game: [3, 'Насыщенное вино не теряется рядом с дичью'],
    cheese_hard: [3, 'Соль и жир выдержанного сыра смягчают терпкость'],
    meat_pork: [2, 'Вино справится с жирной свининой'],
    snack_charcuterie: [2, 'Плотное вино выдержит колбасы и копчёности'],
    veg_mushroom: [-1, 'Умами грибов усилит терпкость — лучше мягкое красное'],
    fish_white: [-3, TANNIN_FISH],
    fish_seafood: [-3, TANNIN_FISH],
    fish_fatty: [-2, TANNIN_FISH],
    spicy_hot: [-3, TANNIN_HEAT],
    asian: [-2, 'Соевый соус и имбирь спорят с танинами'],
    dessert_fruit: [-3, DRY_DESSERT],
    dessert_choc: [-2, 'Горькое с терпким даёт ещё больше горечи'],
    cheese_fresh: [-2, 'Мощное вино перебьёт нежный сыр'],
    veg_salad: [-2, VINEGAR_RED],
  },
  red_medium: {
    meat_pork: [3, 'Сочная свинина и мягкие танины — под стать друг другу'],
    pasta_tomato: [3, 'Кислотность вина держит томатный соус'],
    snack_charcuterie: [3, 'Мягкие танины и ягоды — к мясным закускам'],
    meat_game: [3, 'Ягодные ноты дополнят дичь'],
    meat_red: [2, 'Мягкие танины — к жаркому и тушёному мясу'],
    meat_shashlik: [2, 'Ягодный вкус выдержит мясо на углях'],
    meat_poultry: [2, 'Утка и индейка — под стать округлому вкусу'],
    cheese_hard: [2, 'Выдержанный сыр смягчит танины'],
    veg_mushroom: [2, 'Землистые ноты вина вторят грибам'],
    fish_seafood: [-3, TANNIN_FISH],
    fish_white: [-2, TANNIN_FISH],
    spicy_hot: [-2, TANNIN_HEAT],
    dessert_fruit: [-3, DRY_DESSERT],
    dessert_choc: [-2, CHOCOLATE],
    veg_salad: [-2, VINEGAR_RED],
  },
  red_light: {
    meat_poultry: [3, 'Лёгкие танины не спорят с нежной птицей'],
    veg_mushroom: [3, 'Землистые ноты вина вторят грибам'],
    fish_fatty: [3, 'Мало танинов, много свежести — редкое красное к лососю'],
    meat_pork: [2, 'Свежая кислотность освежит свинину'],
    pasta_tomato: [2, 'Кислотность под стать томату'],
    snack_charcuterie: [2, 'Свежая кислотность освежит мясные закуски'],
    cheese_fresh: [2, 'Мягкие сыры вроде камамбера — деликатная пара'],
    meat_red: [-2, LIGHT_HEAVY],
    fish_seafood: [-2, 'Даже мягкие танины спорят с морепродуктами'],
    spicy_hot: [-2, 'Острота заглушит тонкое вино'],
    dessert_fruit: [-3, DRY_DESSERT],
    dessert_choc: [-3, CHOCOLATE],
  },
  white_light: {
    fish_white: [3, 'Свежая кислотность — как лимон к рыбе'],
    fish_seafood: [3, 'Яркая кислотность подчеркнёт морепродукты'],
    cheese_fresh: [3, 'Свежий сыр и свежая кислотность'],
    veg_salad: [3, 'Кислотность выдержит заправку и зелень'],
    snack_aperitif: [2, 'Бодрое вино для аперитива'],
    snack_fried: [2, 'Кислотность очистит нёбо от масла'],
    asian: [2, 'Свежесть к суши и лёгкой азиатской кухне'],
    meat_poultry: [2, 'Лёгкое к лёгкому: курица с травами'],
    dessert_choc: [-3, CHOCOLATE],
    meat_red: [-2, LIGHT_HEAVY],
    meat_game: [-2, LIGHT_HEAVY],
    meat_shashlik: [-2, LIGHT_HEAVY],
    dessert_fruit: [-2, DRY_DESSERT],
    cheese_blue: [-2, BLUE_LIGHT],
  },
  white_full: {
    fish_fatty: [3, 'Плотность вина под стать лососю'],
    pasta_cream: [3, 'Сливочные ноты вина — к сливочному соусу'],
    meat_poultry: [3, 'Округлое вино к курице и индейке в сливочном соусе'],
    fish_seafood: [2, 'Плотности хватит на морепродукты на гриле и в соусе'],
    meat_pork: [2, 'Выдержит свинину в сливочном или фруктовом соусе'],
    veg_mushroom: [2, 'Грибы в сливках — классика к выдержанному белому'],
    cheese_fresh: [2, 'Сливочные ноты вина — к мягким сырам'],
    dessert_choc: [-3, CHOCOLATE],
    spicy_hot: [-2, 'Острота подчеркнёт алкоголь и дуб'],
    meat_red: [-2, NEEDS_TANNIN],
    dessert_fruit: [-2, DRY_DESSERT],
  },
  rose: {
    snack_aperitif: [3, 'Свежее и ягодное — идеально для аперитива'],
    fish_fatty: [3, 'Ягодная свежесть к лососю и тунцу'],
    veg_salad: [3, 'Свежесть вина — к салатам и овощам'],
    asian: [3, 'Свежесть и немного ягод — к азиатской кухне'],
    meat_poultry: [2, 'Свежесть и ягоды — к птице на гриле'],
    pasta_tomato: [2, 'Средиземноморская пара: томаты и розовое'],
    fish_white: [2, 'Лёгкое вино не заглушит нежную рыбу'],
    snack_charcuterie: [2, 'Ягодная кислотность освежит мясные закуски'],
    cheese_fresh: [2, 'Свежесть вина — к свежим сырам'],
    dessert_choc: [-3, CHOCOLATE],
    dessert_fruit: [-2, DRY_DESSERT],
    meat_red: [-2, LIGHT_HEAVY],
    cheese_blue: [-2, BLUE_LIGHT],
  },
  orange: {
    veg_mushroom: [3, 'Танины и землистость оранжевого вина — к грибам'],
    cheese_hard: [3, 'Выдержанный сыр под стать структуре вина'],
    asian: [3, 'Пряности и умами — сильная сторона оранжевых вин'],
    meat_poultry: [2, 'Лёгкие танины выдержат птицу со специями'],
    meat_pork: [2, 'Структура вина справится со свининой'],
    meat_shashlik: [2, 'Танины оранжевого вина выдержат мясо на углях'],
    snack_charcuterie: [2, 'Терпкость освежит мясные закуски'],
    spicy_hot: [1, 'Мягкую остроту выдержит, жгучую — нет'],
    dessert_fruit: [-2, DRY_DESSERT],
    dessert_choc: [-2, CHOCOLATE],
    fish_seafood: [-2, 'Терпкость спорит с морепродуктами'],
  },
  sparkling_dry: {
    fish_seafood: [3, 'Пузырьки и кислотность подчёркивают устрицы и икру'],
    snack_fried: [3, 'Пузырьки очищают нёбо от соли и масла'],
    snack_aperitif: [3, 'Свежесть и пузырьки разбудят аппетит'],
    cheese_fresh: [3, 'Свежий сыр и живая кислотность'],
    fish_white: [2, 'Лёгкое к лёгкому: вино не заглушит рыбу'],
    fish_fatty: [2, 'Пузырьки освежат жирную рыбу'],
    asian: [2, 'Кислотность и пузырьки — к суши и роллам'],
    meat_poultry: [2, 'Пузырьки освежат птицу в сливочном соусе'],
    cheese_hard: [2, 'Солёный пармезан и дрожжевые ноты брюта — классика'],
    dessert_choc: [-3, CHOCOLATE],
    dessert_fruit: [-2, 'Рядом со сладким брют покажется кислым'],
    meat_red: [-2, NEEDS_TANNIN],
    meat_game: [-2, LIGHT_HEAVY],
    spicy_hot: [-1, 'Острота подчеркнёт резкость брюта'],
  },
  sparkling_offdry: {
    spicy_hot: [3, 'Лёгкая сладость гасит остроту'],
    asian: [3, 'Сладость и пузырьки — к пряной азиатской кухне'],
    snack_aperitif: [3, 'Мягкое игристое для аперитива'],
    cheese_fresh: [2, 'Лёгкая сладость и пузырьки — к свежим сырам'],
    fish_fatty: [2, 'Пузырьки освежат жирную рыбу'],
    dessert_fruit: [2, 'Лёгкой сладости хватит к нежным фруктовым десертам'],
    dessert_choc: [-3, CHOCOLATE],
    meat_red: [-2, NEEDS_TANNIN],
    fish_seafood: [-1, 'К устрицам лучше брют: сладость спорит с солью'],
  },
  sparkling_sweet: {
    dessert_fruit: [3, 'Вино слаще десерта — вкус не станет кислым'],
    cheese_blue: [2, 'Сладость оттеняет солёный голубой сыр'],
    spicy_hot: [2, 'Сладость смягчает остроту'],
    meat_red: [-3, SWEET_SAVORY],
    meat_game: [-3, SWEET_SAVORY],
    fish_white: [-3, 'Сладость спорит с нежной рыбой'],
    fish_seafood: [-3, 'Сладость спорит с солёными морепродуктами'],
    dessert_choc: [-2, 'Шоколад заглушит лёгкое игристое'],
  },
  still_offdry: {
    spicy_hot: [3, 'Лёгкая сладость гасит остроту'],
    asian: [3, 'Лёгкая сладость дружит с имбирём и соевым соусом'],
    meat_pork: [2, 'Лёгкая сладость дополнит свинину с фруктовым соусом'],
    cheese_fresh: [2, 'Мягкая сладость к сливочным сырам'],
    fish_fatty: [2, 'Сладость и свежесть оттенят копчёную рыбу'],
    veg_salad: [2, 'Лёгкая сладость — к салатам с фруктами'],
    dessert_choc: [-2, CHOCOLATE],
    meat_red: [-2, 'Сладость спорит со стейком'],
  },
  still_semisweet: {
    dessert_fruit: [3, 'Сладость вина под стать фруктовому десерту'],
    spicy_hot: [3, 'Сладость гасит остроту'],
    cheese_blue: [3, 'Сладость оттеняет солёный голубой сыр'],
    asian: [2, 'Сладость смягчит специи азиатской кухни'],
    cheese_fresh: [2, 'Сладость оттенит свежие сыры'],
    snack_aperitif: [2, 'Лёгкое сладковатое вино разбудит аппетит'],
    // Полусладкое красное к шашлыку — привычка, но сухое раскроется лучше.
    meat_red: [-2, 'Сухое красное раскроется с мясом лучше'],
    meat_shashlik: [-2, 'Сухое красное раскроется с шашлыком лучше'],
    fish_white: [-2, 'Сладость спорит с нежной рыбой'],
    fish_seafood: [-2, 'Сладость спорит с солёными морепродуктами'],
    pasta_tomato: [-2, 'Сладость спорит с томатом'],
    pasta_cream: [-2, 'Сладость спорит со сливочным соусом'],
  },
  sweet: {
    dessert_fruit: [3, 'Вино слаще десерта — вкус не станет кислым'],
    cheese_blue: [3, 'Сладость оттеняет солёный голубой сыр'],
    cheese_hard: [2, 'Сладость вина оттенит солёный выдержанный сыр'],
    dessert_choc: [2, 'Сладкое вино выдержит молочный шоколад'],
    spicy_hot: [1, 'Сладость смягчит остроту'],
    fish_white: [-3, DESSERT_MAIN],
    fish_fatty: [-3, DESSERT_MAIN],
    fish_seafood: [-3, DESSERT_MAIN],
    veg_salad: [-3, 'Сладость спорит с заправкой'],
    meat_red: [-2, DESSERT_MAIN],
    meat_shashlik: [-2, DESSERT_MAIN],
    meat_poultry: [-2, DESSERT_MAIN],
    pasta_tomato: [-2, DESSERT_MAIN],
    pasta_cream: [-2, DESSERT_MAIN],
    meat_pork: [-2, DESSERT_MAIN],
    meat_game: [-2, DESSERT_MAIN],
  },
  dessert_fortified_white: {
    dessert_fruit: [3, 'Густая сладость креплёного вина — к фруктовым десертам и выпечке'],
    cheese_blue: [3, 'Сладость оттеняет солёный голубой сыр'],
    cheese_hard: [2, 'Сладость вина оттенит солёный выдержанный сыр'],
    dessert_choc: [2, 'Густая сладость выдержит молочный шоколад'],
    fish_white: [-3, DESSERT_MAIN],
    fish_fatty: [-3, DESSERT_MAIN],
    fish_seafood: [-3, DESSERT_MAIN],
    veg_salad: [-3, DESSERT_MAIN],
    spicy_hot: [-3, ALCOHOL_HEAT],
    meat_red: [-2, DESSERT_MAIN],
    meat_shashlik: [-2, DESSERT_MAIN],
    meat_poultry: [-2, DESSERT_MAIN],
    pasta_tomato: [-2, DESSERT_MAIN],
    pasta_cream: [-2, DESSERT_MAIN],
    meat_pork: [-2, DESSERT_MAIN],
    meat_game: [-2, DESSERT_MAIN],
  },
  dessert_fortified_red: {
    dessert_choc: [3, 'Густая сладость креплёного вина выдерживает шоколад'],
    cheese_blue: [3, 'Сладость против солёного голубого сыра'],
    cheese_hard: [3, 'Выдержанный сыр смягчит крепость'],
    dessert_fruit: [2, 'Ягодные ноты вина — к ягодным десертам'],
    fish_white: [-3, DESSERT_MAIN],
    fish_fatty: [-3, DESSERT_MAIN],
    fish_seafood: [-3, DESSERT_MAIN],
    veg_salad: [-3, DESSERT_MAIN],
    spicy_hot: [-3, ALCOHOL_HEAT],
    meat_poultry: [-2, DESSERT_MAIN],
    meat_red: [-2, DESSERT_MAIN],
    meat_shashlik: [-2, DESSERT_MAIN],
    pasta_tomato: [-2, DESSERT_MAIN],
    pasta_cream: [-2, DESSERT_MAIN],
    meat_pork: [-2, DESSERT_MAIN],
    meat_game: [-2, DESSERT_MAIN],
  },
  fortified_dry: {
    snack_aperitif: [3, 'Сухое креплёное — классический аперитив к оливкам и орехам'],
    cheese_hard: [3, 'Выдержанный сыр и ореховые ноты вина'],
    veg_mushroom: [2, 'Грибы и ореховые тона'],
    snack_charcuterie: [2, 'Ореховые тона вина — к хамону и вяленому мясу'],
    dessert_fruit: [-3, 'Сухому креплёному вину нужна не сладость, а соль'],
    dessert_choc: [-3, 'Сухому креплёному вину нужна не сладость, а соль'],
    snack_fried: [2, 'Солоноватые тона и крепость — к жареным закускам'],
    spicy_hot: [-3, ALCOHOL_HEAT],
  },
  // Красное игристое — не белый брют: танины и ягоды тянутся к мясу, а не к устрицам.
  sparkling_red: {
    snack_charcuterie: [3, 'Пузырьки и ягоды освежат колбасы и копчёности'],
    meat_pork: [2, 'Ягодная кислотность и пузырьки — к сочной свинине'],
    meat_shashlik: [2, 'Живое красное игристое — к мясу на углях'],
    pasta_tomato: [2, 'Кислотность и пузырьки — к пицце и томатной пасте'],
    cheese_hard: [2, 'Солёный выдержанный сыр смягчит терпкость'],
    snack_fried: [2, 'Пузырьки очищают нёбо от соли и масла'],
    fish_seafood: [-2, TANNIN_FISH],
    fish_white: [-2, TANNIN_FISH],
    dessert_fruit: [-2, DRY_DESSERT],
    dessert_choc: [-2, CHOCOLATE],
  },
  // Полусухое красное: танины остались, сладость смягчает — но рыбе и чили это не помогает.
  red_offdry: {
    meat_pork: [2, 'Лёгкая сладость и мягкие танины — к свинине с фруктовым соусом'],
    snack_charcuterie: [2, 'Ягодный вкус — к мясным закускам'],
    meat_shashlik: [2, 'Привычная пара к шашлыку, хотя сухое раскроется ярче'],
    cheese_hard: [2, 'Выдержанный сыр оттенит фруктовую сладость'],
    pasta_tomato: [1, 'Можно к томатной пасте'],
    fish_white: [-2, TANNIN_FISH],
    fish_seafood: [-2, TANNIN_FISH],
    veg_salad: [-2, VINEGAR_RED],
    spicy_hot: [-2, TANNIN_HEAT],
    dessert_choc: [-2, CHOCOLATE],
    dessert_fruit: [-1, 'Для десерта сладости маловато'],
  },
}

/** Как правила назвали стиль — это видит пользователь рядом с советом. */
export const STYLE_PROFILE: Readonly<Record<StyleKey, string>> = {
  red_full: 'Плотное сухое красное',
  red_medium: 'Сухое красное средней насыщенности',
  red_light: 'Лёгкое красное',
  white_light: 'Свежее белое',
  white_full: 'Насыщенное белое',
  rose: 'Сухое розовое',
  orange: 'Оранжевое вино',
  sparkling_dry: 'Сухое игристое',
  sparkling_offdry: 'Игристое с лёгкой сладостью',
  sparkling_sweet: 'Сладкое игристое',
  still_offdry: 'Полусухое',
  still_semisweet: 'Полусладкое',
  sweet: 'Сладкое',
  dessert_fortified_white: 'Десертное креплёное',
  dessert_fortified_red: 'Десертное креплёное красное',
  fortified_dry: 'Сухое креплёное',
  sparkling_red: 'Красное игристое',
  red_offdry: 'Полусухое красное',
}

export type Glass = 'Бордо' | 'Бургундия' | 'Для белого' | 'Тюльпан' | 'Универсальный' | 'Десертный'

export interface ServingRule {
  temperature: readonly [number, number]
  glass: Glass
  tip: string | null
}

/**
 * Подача по стилю. Температуры — по рекомендациям Роскачества и WSET:
 * чем проще и свежее вино, тем сильнее его можно охладить.
 */
export const SERVING: Readonly<Record<StyleKey, ServingRule>> = {
  red_full: {
    temperature: [16, 18],
    glass: 'Бордо',
    tip: 'Дайте вину постоять в бокале 15–20 минут',
  },
  red_medium: { temperature: [15, 17], glass: 'Бордо', tip: null },
  red_light: {
    temperature: [14, 16],
    glass: 'Бургундия',
    tip: 'Слегка охладите — вино станет свежее',
  },
  white_light: { temperature: [8, 10], glass: 'Для белого', tip: null },
  white_full: {
    temperature: [10, 13],
    glass: 'Бургундия',
    tip: 'Не переохлаждайте: аромат закроется',
  },
  rose: { temperature: [8, 10], glass: 'Для белого', tip: null },
  orange: { temperature: [12, 14], glass: 'Универсальный', tip: null },
  sparkling_dry: { temperature: [6, 8], glass: 'Тюльпан', tip: 'Наливайте на ¾ бокала' },
  sparkling_offdry: { temperature: [6, 8], glass: 'Тюльпан', tip: 'Наливайте на ¾ бокала' },
  sparkling_sweet: { temperature: [6, 8], glass: 'Тюльпан', tip: null },
  still_offdry: { temperature: [8, 10], glass: 'Для белого', tip: null },
  still_semisweet: { temperature: [8, 10], glass: 'Для белого', tip: null },
  sweet: {
    temperature: [8, 12],
    glass: 'Десертный',
    tip: 'Наливайте понемногу: это вино к десерту',
  },
  dessert_fortified_white: { temperature: [12, 16], glass: 'Десертный', tip: null },
  dessert_fortified_red: { temperature: [14, 16], glass: 'Десертный', tip: null },
  fortified_dry: { temperature: [12, 16], glass: 'Десертный', tip: null },
  sparkling_red: { temperature: [10, 12], glass: 'Тюльпан', tip: 'Слегка охладите, но не как белое' },
  red_offdry: { temperature: [14, 16], glass: 'Универсальный', tip: null },
}

/** Красные полусухие и полусладкие подают теплее белых. */
export const RED_SWEETISH_SERVING: ServingRule = {
  temperature: [14, 16],
  glass: 'Универсальный',
  tip: null,
}

/**
 * Сорта: их вклад — танины, «лёгкость», ароматика и конкретные пары,
 * которые точнее правил стиля («кавказская классика: шашлык из баранины»).
 * Пары из dry применяются к сухим и полусухим тихим винам, из sweet — к сладким
 * и десертным. Только для моносортовых вин того же цвета, что и ягода: у купажа
 * сорт в неизвестной доле, а у розового из Пино Нуар нет «лёгких танинов красного».
 * У игристого и креплёного свой характер, там решает строка стиля.
 */
export interface GrapeRule {
  /** Цвет ягоды: конкретика красного сорта не относится к розовому или белому из него. */
  color?: 'red' | 'white'
  tannin?: 0 | 1 | 2 | 3
  light?: boolean
  full?: boolean
  aromatic?: boolean
  serving?: Partial<ServingRule>
  dry?: Partial<Record<FoodId, string>>
  sweet?: Partial<Record<FoodId, string>>
}

export const GRAPES: Readonly<Record<string, GrapeRule>> = {
  'Каберне Совиньон': {
    color: 'red',
    tannin: 3,
    dry: {
      meat_red: 'Мощные танины смягчаются белком и жиром стейка',
      meat_shashlik: 'Смородиновые ноты сорта перекликаются с дымком углей',
      cheese_hard: 'Соль и жир выдержанного сыра смягчают терпкость',
      meat_game: 'Плотное вино не теряется рядом с дичью',
    },
  },
  Мерло: {
    color: 'red',
    tannin: 2,
    dry: {
      meat_red: 'Мягкие танины — к жаркому и тушёной говядине',
      meat_pork: 'Сливовая мягкость дополнит сочную свинину',
      pasta_tomato: 'Спелый фрукт Мерло хорош к пицце и лазанье',
      meat_poultry: 'Утка и индейка — под стать округлому вкусу',
    },
  },
  'Пино Нуар': {
    color: 'red',
    tannin: 1,
    light: true,
    serving: { temperature: [14, 16], glass: 'Бургундия' },
    dry: {
      veg_mushroom: 'Землистые ноты Пино Нуар вторят грибам',
      meat_poultry: 'Лёгкие танины не спорят с нежной птицей',
      fish_fatty: 'Редкое красное к лососю: мало танинов, много свежести',
      cheese_fresh: 'Мягкие сыры вроде камамбера — деликатная пара',
    },
  },
  Сира: {
    color: 'red',
    tannin: 2,
    dry: {
      meat_shashlik: 'Сире свойственны перечные ноты — как специи в маринаде',
      meat_red: 'Баранина на гриле под стать насыщенности сорта',
      meat_game: 'Пряность вина подчеркнёт дичь',
      cheese_hard: 'Выдержанный сыр смягчит танины',
    },
  },
  Саперави: {
    color: 'red',
    tannin: 3,
    dry: {
      meat_shashlik: 'Кавказская классика: шашлык из баранины',
      meat_red: 'Кислотность и танины справятся с жирным мясом',
      meat_game: 'Густой ягодный характер Саперави выдержит дичь',
      cheese_hard: 'Солёный выдержанный сыр смягчит терпкость',
    },
  },
  'Красностоп Золотовский': {
    color: 'red',
    tannin: 3,
    dry: {
      meat_red: 'Мощные танины раскрываются со стейком на гриле',
      meat_game: 'Утка с ягодным соусом повторит смородиновые ноты сорта',
      cheese_hard: 'Выдержанный сыр смягчит терпкость',
      pasta_tomato: 'Высокая кислотность держит томатный соус',
    },
  },
  'Цимлянский черный': {
    color: 'red',
    tannin: 2,
    serving: { temperature: [15, 17] },
    dry: {
      meat_red: 'Донская классика к мясу и жаркому',
      meat_game: 'Ягодные ноты дополнят дичь',
      snack_charcuterie: 'Хорош к холодным мясным закускам',
      cheese_hard: 'Выдержанный сыр подчеркнёт пряность',
    },
  },
  'Одесский черный': {
    color: 'red',
    tannin: 2,
    dry: {
      snack_charcuterie: 'Классика к колбасам и копчёностям',
      meat_shashlik: 'Плотное вино для мяса на углях',
      meat_red: 'Тёмноягодный характер сорта — к насыщенному мясу',
    },
    sweet: { dessert_choc: 'Десертный Одесский чёрный слаще шоколада — пара сложится' },
  },
  Мальбек: {
    color: 'red',
    tannin: 2,
    dry: {
      meat_red: 'Сочный фрукт и мягкие танины Мальбека — эталон к стейку',
      meat_shashlik: 'Аргентинская традиция: мальбек к мясу на углях',
      cheese_hard: 'Солёный сыр подчеркнёт сливовый вкус',
      veg_mushroom: 'Грибы гриль — к бархатистому вину',
    },
  },
  'Каберне Фран': {
    color: 'red',
    tannin: 2,
    serving: { temperature: [15, 17] },
    dry: {
      meat_pork: 'Свежесть и травы к свинине',
      veg_mushroom: 'Травянистые ноты сорта — к овощам гриль и грибам',
      meat_poultry: 'Свежая кислотность освежит жирную утку',
      cheese_fresh: 'Классика Луары: козий сыр',
    },
  },
  Цвайгельт: {
    color: 'red',
    tannin: 1,
    light: true,
    serving: { temperature: [14, 16], glass: 'Бургундия' },
    dry: {
      meat_pork: 'Вишнёвая свежесть сорта — к шницелю и свинине',
      snack_charcuterie: 'Вишнёвая кислотность освежит колбасы и паштеты',
      pasta_tomato: 'Кислотность под стать томату',
      meat_poultry: 'Лёгкое вино не спорит с птицей',
    },
  },
  'Бастардо Магарачский': {
    color: 'red',
    tannin: 2,
    dry: {
      meat_shashlik: 'Мясо на углях и жаркое из баранины',
      meat_red: 'Утка и говядина с пряными соусами',
    },
    sweet: {
      dessert_choc: 'Десертное Бастардо — пара к шоколаду',
      cheese_blue: 'Сладость против солёного сыра',
    },
  },
  Голубок: {
    color: 'red',
    tannin: 2,
    dry: {
      meat_red: 'Густой тёмный сорт — к мясу',
      meat_shashlik: 'Ягодный вкус к мясу на углях',
      snack_charcuterie: 'Тёмные ягоды к колбасам и копчёностям',
    },
  },
  Рислинг: {
    color: 'white',
    aromatic: true,
    serving: { temperature: [7, 10] },
    dry: {
      meat_pork: 'Кислотность разрезает жир свинины',
      asian: 'Свежесть и фрукт — к имбирю и соевому соусу',
      fish_fatty: 'Освежит копчёную и жирную рыбу',
      spicy_hot: 'Невысокий алкоголь и свежесть не разжигают остроту',
    },
  },
  Шардоне: {
    color: 'white',
    dry: {
      fish_fatty: 'Плотность вина под стать лососю',
      pasta_cream: 'Сливочные ноты — к сливочному соусу',
      meat_poultry: 'Сливочная текстура вина — к курице в сливочном соусе',
      fish_seafood: 'Округлое вино к мидиям и креветкам в соусе',
    },
  },
  'Совиньон Блан': {
    color: 'white',
    serving: { temperature: [7, 10] },
    dry: {
      cheese_fresh: 'Классика: свежий козий сыр',
      veg_salad: 'Кислотность выдержит заправку и зелень',
      fish_white: 'Цитрусовая свежесть — как лимон к рыбе',
      fish_seafood: 'Яркая кислотность — как лимон к устрицам',
    },
  },
  Алиготе: {
    color: 'white',
    dry: {
      fish_seafood: 'Яркая кислотность — как лимон к устрицам',
      fish_white: 'Лёгкое к лёгкому: нежная рыба',
      snack_aperitif: 'Бодрое вино для аперитива',
      cheese_fresh: 'Свежий сыр и свежая кислотность',
    },
  },
  Ркацители: {
    color: 'white',
    dry: {
      fish_white: 'Свежая кислотность к речной и морской рыбе',
      cheese_fresh: 'Сулугуни и брынза — кавказская пара',
      meat_poultry: 'Курица с зеленью и специями',
    },
  },
  Кокур: {
    color: 'white',
    dry: {
      fish_white: 'Черноморская рыба: барабуля, камбала',
      fish_seafood: 'Мидии и рапаны — крымская пара',
      cheese_fresh: 'Персиковые ноты сорта — к мягкому сыру',
    },
    sweet: { dessert_fruit: 'Кокуру свойственны медовые и персиковые тона — к фруктовым десертам' },
  },
  Сибирьковый: {
    color: 'white',
    serving: { temperature: [10, 12] },
    dry: {
      fish_white: 'Донская пара: судак и речная рыба',
      fish_seafood: 'Минеральность подчеркнёт морепродукты',
      meat_poultry: 'Белое мясо под стать округлому вкусу',
      veg_salad: 'Травянистые ноты сорта — к овощам и зелени',
    },
  },
  'Пино Гри': {
    color: 'white',
    dry: {
      fish_white: 'Мягкое вино не заглушит нежную рыбу',
      fish_seafood: 'Мягкая кислотность к креветкам и кальмарам',
      veg_salad: 'Мягкое вино не спорит с зеленью',
      snack_aperitif: 'Лёгкое и понятное — хороший аперитив',
    },
  },
  Гевюрцтраминер: {
    color: 'white',
    aromatic: true,
    serving: { temperature: [8, 11] },
    dry: {
      spicy_hot: 'Пряный аромат вина — к карри и острому',
      asian: 'Имбирь и специи азиатской кухни',
      cheese_fresh: 'Яркий аромат вина к мягким сливочным сырам',
      fish_fatty: 'Яркий аромат сорта выдержит копчёную рыбу',
    },
  },
  Вионье: {
    color: 'white',
    full: true,
    serving: { temperature: [10, 12] },
    dry: {
      meat_poultry: 'Курица с абрикосами и специями',
      asian: 'Абрикосовые ноты Вионье — к мягкой азиатской кухне',
      fish_seafood: 'Плотное вино к креветкам и крабу в сливочном соусе',
      pasta_cream: 'Плотное вино к сливочной пасте',
    },
  },
  'Цитронный Магарача': {
    color: 'white',
    aromatic: true,
    dry: {
      fish_seafood: 'Цитрусовый аромат сорта — как лимон к устрицам',
      fish_fatty: 'Цитрусовая свежесть освежит красную рыбу',
      veg_salad: 'Цитрусовый аромат к салатам с зеленью',
      spicy_hot: 'Мускатный аромат смягчает остроту',
    },
  },
  'Первенец Магарача': {
    color: 'white',
    dry: {
      fish_white: 'Свежая кислотность к рыбе',
      snack_aperitif: 'Свежее вино разбудит аппетит',
    },
    sweet: {
      dessert_fruit: 'Десертному Первенцу свойственны сухофрукты и карамель — к выпечке',
      cheese_hard: 'Тона сухофруктов — к выдержанному сыру и орехам',
    },
  },
}

/** Семейства: «Мускат Белый», «Мускат Оттонель», «Мускат Розовый» — одно правило. */
export const GRAPE_FAMILIES: ReadonlyArray<readonly [prefix: string, rule: GrapeRule]> = [
  [
    'мускат',
    {
      aromatic: true,
      dry: {
        snack_aperitif: 'Яркий аромат — отличный аперитив',
        spicy_hot: 'Мускатный аромат смягчает пряности',
      },
      sweet: {
        dessert_fruit: 'Вино слаще десерта — вкус не станет кислым',
        cheese_blue: 'Сладость оттеняет солёный голубой сыр',
      },
    },
  ],
  ['красностоп', { tannin: 3 }],
  ['бастардо', { tannin: 2 }],
  ['траминер', { aromatic: true }],
]
