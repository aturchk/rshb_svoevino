import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  advise,
  grapeRule,
  scoreFoods,
  servingOf,
  styleKeyOf,
  verdictFor,
} from '../app/entities/pairing/lib/engine.ts'
import { FOOD_GROUPS, FOODS } from '../app/entities/pairing/lib/foods.ts'
import { GRAPES } from '../app/entities/pairing/lib/knowledge.ts'
import { pairingTraitsOf } from '../app/entities/pairing/lib/traits.ts'
import type { FoodId, PairingTraits } from '../app/entities/pairing/model/types.ts'
import type { WineDetailFile, WineDict } from '../app/shared/config/dataset-schema.ts'

const dataDir = resolve(import.meta.dirname, '../public/data')

const wine = (patch: Partial<PairingTraits>): PairingTraits => ({
  name: 'Вино',
  sweetHint: false,
  category: 'Красное',
  style: 'Сухое',
  sparkling: false,
  fortified: false,
  oak: false,
  abv: 13,
  grapes: [],
  ...patch,
})
const score = (traits: PairingTraits, food: FoodId): number =>
  scoreFoods(traits).find((item) => item.food.id === food)?.score ?? Number.NaN

const SAPERAVI = wine({ grapes: ['Саперави'], abv: 13.5 })
const PINOT = wine({ grapes: ['Пино Нуар'], abv: 12.5 })
const ALIGOTE = wine({ category: 'Белое', grapes: ['Алиготе'], abv: 12 })
const BRUT = wine({
  category: 'Белое',
  style: 'Брют',
  sparkling: true,
  grapes: ['Шардоне'],
  abv: 12,
})
const KAGOR = wine({ style: 'Сладкое', fortified: true, grapes: ['Каберне Совиньон'], abv: 16 })
const MUSCAT_DESSERT = wine({
  category: 'Белое',
  style: 'Сладкое',
  fortified: true,
  grapes: ['Мускат Белый'],
  abv: 16,
})

describe('styleKeyOf', () => {
  it('сухое красное с танинным сортом — плотное', () => {
    expect(styleKeyOf(SAPERAVI)).toBe('red_full')
    expect(styleKeyOf(wine({ grapes: ['Саперави'], abv: 12 }))).toBe('red_full')
  })

  it('Пино Нуар — лёгкое красное, даже на 13%', () => {
    expect(styleKeyOf(PINOT)).toBe('red_light')
  })

  it('игристость и креплёность решают раньше цвета', () => {
    expect(styleKeyOf(BRUT)).toBe('sparkling_dry')
    expect(styleKeyOf(KAGOR)).toBe('dessert_fortified_red')
    expect(styleKeyOf(wine({ category: 'Белое', style: 'Сухое', fortified: true }))).toBe(
      'fortified_dry',
    )
  })

  it('по ГОСТ «сухое» игристое слаще брюта', () => {
    expect(styleKeyOf(wine({ category: 'Белое', style: 'Сухое', sparkling: true }))).toBe(
      'sparkling_offdry',
    )
  })

  it('белое в дубе или от 13.5% — насыщенное', () => {
    expect(styleKeyOf(wine({ category: 'Белое', grapes: ['Шардоне'], oak: true, abv: 12.5 }))).toBe(
      'white_full',
    )
    expect(styleKeyOf(ALIGOTE)).toBe('white_light')
  })

  it('сахар не указан — считаем сухим', () => {
    expect(styleKeyOf(wine({ category: 'Белое', style: null, abv: 12 }))).toBe('white_light')
  })
})

describe('принципы сочетания', () => {
  it('танины с рыбой — плохо', () => {
    expect(score(SAPERAVI, 'fish_white')).toBeLessThanOrEqual(-2)
    expect(scoreFoods(SAPERAVI).find((item) => item.food.id === 'fish_white')?.reason).toMatch(
      /металлическ/,
    )
  })

  it('к шашлыку — Саперави, с конкретикой сорта', () => {
    const shashlik = scoreFoods(SAPERAVI).find((item) => item.food.id === 'meat_shashlik')
    expect(shashlik?.score).toBeGreaterThanOrEqual(3)
    expect(shashlik?.reason).toMatch(/Кавказская классика/)
  })

  it('сорт не спасает плохую пару: полусладкое Саперави к стейку — нет', () => {
    expect(score(wine({ style: 'Полусладкое', grapes: ['Саперави'] }), 'meat_red')).toBeLessThan(0)
  })

  it('брют — к устрицам и жареному, но не к шоколаду', () => {
    expect(score(BRUT, 'fish_seafood')).toBeGreaterThanOrEqual(3)
    expect(score(BRUT, 'snack_fried')).toBeGreaterThanOrEqual(3)
    expect(score(BRUT, 'dessert_choc')).toBe(-3)
  })

  it('у игристого пары решает стиль, а не сорт тихого вина', () => {
    const seafood = scoreFoods(BRUT).find((item) => item.food.id === 'fish_seafood')
    expect(seafood?.reason).toMatch(/Пузырьки/)
  })

  it('десертное креплёное красное — к шоколаду и голубому сыру', () => {
    expect(score(KAGOR, 'dessert_choc')).toBeGreaterThanOrEqual(3)
    expect(score(KAGOR, 'cheese_blue')).toBeGreaterThanOrEqual(3)
    expect(score(KAGOR, 'fish_white')).toBe(-3)
  })

  it('вино должно быть слаще десерта', () => {
    expect(score(ALIGOTE, 'dessert_fruit')).toBeLessThan(0)
    expect(score(MUSCAT_DESSERT, 'dessert_fruit')).toBeGreaterThanOrEqual(3)
  })

  it('сладость гасит остроту, танины разжигают', () => {
    const riesling = wine({ category: 'Белое', style: 'Полусухое', grapes: ['Рислинг'], abv: 11 })
    expect(score(riesling, 'spicy_hot')).toBeGreaterThanOrEqual(3)
    expect(score(SAPERAVI, 'spicy_hot')).toBe(-3)
  })

  it('Пино Нуар — редкое красное к лососю', () => {
    expect(score(PINOT, 'fish_fatty')).toBeGreaterThanOrEqual(3)
  })
})

describe('advise', () => {
  it('3–6 пар, не больше двух из одной группы', () => {
    const advice = advise(SAPERAVI)
    expect(advice.pairings.length).toBeGreaterThanOrEqual(3)
    expect(advice.pairings.length).toBeLessThanOrEqual(6)
    const groups = advice.pairings.map((pairing) => pairing.food.group)
    for (const group of new Set(groups)) {
      expect(groups.filter((item) => item === group).length).toBeLessThanOrEqual(2)
    }
  })

  it('пары отсортированы: отличные раньше хороших', () => {
    const levels = advise(ALIGOTE).pairings.map((pairing) => pairing.level)
    const firstGood = levels.indexOf('good')
    if (firstGood !== -1) expect(levels.slice(firstGood)).not.toContain('great')
  })

  it('у каждой пары есть объяснение «почему»', () => {
    for (const pairing of advise(BRUT).pairings) expect(pairing.reason.length).toBeGreaterThan(10)
  })

  it('профиль называет стиль человеческим языком', () => {
    expect(advise(SAPERAVI).profile).toBe('Плотное сухое красное')
  })
})

describe('servingOf', () => {
  it('игристое — 6–8 °C в тюльпане', () => {
    expect(servingOf(BRUT)).toMatchObject({ temperature: '6–8 °C', glass: 'Тюльпан' })
  })

  it('плотное красное — 16–18 °C, Бордо', () => {
    expect(servingOf(SAPERAVI)).toMatchObject({ temperature: '16–18 °C', glass: 'Бордо' })
  })

  it('Пино Нуар — Бургундия', () => {
    expect(servingOf(PINOT).glass).toBe('Бургундия')
  })

  it('полусладкое красное подают теплее белого', () => {
    expect(servingOf(wine({ style: 'Полусладкое' })).temperature).toBe('14–16 °C')
  })
})

describe('verdictFor', () => {
  it('Саперави и рыба — не лучший выбор, подобрать другие вина', () => {
    const verdict = verdictFor(SAPERAVI, 'fish')
    expect(verdict.level).toBe('poor')
    expect(verdict.suggestAlternatives).toBe(true)
    expect(verdict.best?.reason).toMatch(/металлическ/)
  })

  it('Саперави и мясо — отличная пара, альтернативы не нужны', () => {
    const verdict = verdictFor(SAPERAVI, 'meat')
    expect(verdict.level).toBe('great')
    expect(verdict.suggestAlternatives).toBe(false)
  })

  it('смешанная группа даёт предупреждение: брют к птице — да, к дичи — нет', () => {
    const verdict = verdictFor(BRUT, 'meat')
    expect(verdict.best?.food.id).toBe('meat_poultry')
    expect(verdict.caveat?.score).toBeLessThanOrEqual(-2)
  })

  it('нейтральная пара объясняется, а не молчит', () => {
    const verdict = verdictFor(wine({ category: 'Белое', grapes: [] }), 'pasta')
    expect(verdict.best?.reason.length).toBeGreaterThan(10)
  })

  it('плохая пара в группе видна, даже если лучшая всего лишь нейтральна', () => {
    const verdict = verdictFor(wine({ style: 'Полусладкое' }), 'meat')
    expect(verdict.caveat?.score).toBeLessThanOrEqual(-2)
  })
})

describe('база правил', () => {
  const dict = JSON.parse(readFileSync(resolve(dataDir, 'dict.json'), 'utf8')) as WineDict

  it('каждый сорт в таблице существует в каталоге — опечатка не пройдёт молча', () => {
    const keys = new Set(dict.grapeKeys.map((key) => key.toLowerCase().replace(/ё/g, 'е')))
    for (const grape of Object.keys(GRAPES)) {
      expect(keys.has(grape.toLowerCase().replace(/ё/g, 'е')), grape).toBe(true)
    }
  })

  it('родственные сорта находят правило семейства', () => {
    expect(grapeRule('Мускат Оттонель')?.aromatic).toBe(true)
    expect(grapeRule('Красностоп')).toBe(grapeRule('Красностоп Золотовский'))
  })

  it('каждая группа чипов ссылается на существующие блюда', () => {
    for (const group of FOOD_GROUPS) {
      for (const food of group.foods) expect(FOODS[food].group).toBe(group.id)
    }
  })

  it('каждое вино каталога получает 3–6 пар с объяснениями и подачу', () => {
    const files = readdirSync(resolve(dataDir, 'wines'))
    expect(files.length).toBe(2103)
    for (const file of files) {
      const detail = JSON.parse(
        readFileSync(resolve(dataDir, 'wines', file), 'utf8'),
      ) as WineDetailFile
      const advice = advise(pairingTraitsOf(detail))
      expect(advice.pairings.length, detail.slug).toBeGreaterThanOrEqual(3)
      expect(advice.pairings.length).toBeLessThanOrEqual(6)
      for (const pairing of advice.pairings) expect(pairing.reason).not.toBe('')
      expect(advice.serving.temperature).toMatch(/^\d+–\d+ °C$/)
    }
  })
})

describe('регрессии из ревью', () => {
  it('розовое из Пино Нуар не получает «красную» подачу и причины сорта', () => {
    const rose = wine({ category: 'Розовое', grapes: ['Пино Нуар'], abv: 12 })
    expect(servingOf(rose).temperature).toBe('8–10 °C')
    const salmon = scoreFoods(rose).find((item) => item.food.id === 'fish_fatty')
    expect(salmon?.reason).not.toMatch(/красное/i)
  })

  it('купаж не берёт конкретику случайного сорта', () => {
    const blend = wine({ category: 'Белое', style: 'Сладкое', fortified: true, grapes: ['Алиготе', 'Кокур'] })
    for (const item of scoreFoods(blend)) expect(item.reason).not.toMatch(/Кокур/)
  })

  it('херес без указания сахара — сухое креплёное', () => {
    expect(styleKeyOf(wine({ name: 'Массандра Херес', category: 'Белое', style: null, fortified: true }))).toBe(
      'fortified_dry',
    )
  })

  it('красное игристое — к мясным закускам, а не к устрицам', () => {
    const red = wine({ style: 'Брют', sparkling: true, grapes: ['Каберне Совиньон'] })
    expect(styleKeyOf(red)).toBe('sparkling_red')
    expect(score(red, 'fish_seafood')).toBeLessThan(0)
    expect(score(red, 'snack_charcuterie')).toBeGreaterThanOrEqual(3)
  })

  it('полусухое красное не советуют к чили и рыбе', () => {
    const red = wine({ style: 'Полусухое', grapes: ['Каберне Совиньон'], abv: 16 })
    expect(styleKeyOf(red)).toBe('red_offdry')
    expect(score(red, 'spicy_hot')).toBeLessThan(0)
    expect(score(red, 'fish_white')).toBeLessThan(0)
  })

  it('сухое розовое к фруктовому десерту — не «нейтрально»', () => {
    expect(score(wine({ category: 'Розовое' }), 'dessert_fruit')).toBeLessThan(0)
  })

  it('танинный сорт на 11% — не «лёгкое красное»', () => {
    expect(styleKeyOf(wine({ grapes: ['Одесский черный'], abv: 11 }))).not.toBe('red_light')
  })

  it('описание «сладкое вино» без сахара в названии — сладкое, а не сухое', () => {
    expect(styleKeyOf(wine({ category: 'Белое', style: null, sweetHint: true }))).toBe('sweet')
  })

  it('сахар не указан — в профиле не написано «сухое»', () => {
    expect(advise(wine({ style: null, grapes: ['Саперави'] })).profile).not.toMatch(/сухое/i)
  })
})
