import { describe, expect, it } from 'vitest'

import {
  deriveAbv,
  deriveColorFamily,
  deriveSparkling,
  deriveStyle,
  splitGrapes,
} from '../scripts/lib/derive.ts'

describe('deriveStyle', () => {
  it('различает полусухое и сухое: подстрока «сухое» есть в обоих', () => {
    expect(deriveStyle('', 'usadba-risling-beloe-polusuhoe-12')).toBe('Полусухое')
    expect(deriveStyle('', 'fanagoriya-kaberne-krasnoe-suhoe-135')).toBe('Сухое')
  })

  it('различает полусладкое и сладкое', () => {
    expect(deriveStyle('', 'x-beloe-polusladkoe-12')).toBe('Полусладкое')
    expect(deriveStyle('', 'x-beloe-sladkoe-137')).toBe('Сладкое')
  })

  it('экстра брют не схлопывается в брют', () => {
    expect(deriveStyle('Абрау экстра брют', 'abrau-ekstra-bryut')).toBe('Экстра брют')
    expect(deriveStyle('Абрау брют', 'abrau-bryut')).toBe('Брют')
  })

  it('возвращает null, когда стиль в названии не указан', () => {
    expect(deriveStyle('Алиготе Баррель, 2024', 'aligote-barrel-2024')).toBeNull()
  })
})

describe('deriveAbv', () => {
  it('трёхзначный хвост читается как десятые', () => {
    expect(deriveAbv('fanagoriya-kaberne-krasnoe-suhoe-135', '')).toBe(13.5)
    expect(deriveAbv('x-beloe-suhoe-105', '')).toBe(10.5)
  })

  it('двузначный хвост читается как целое', () => {
    expect(deriveAbv('x-krasnoe-suhoe-14', '')).toBe(14)
  })

  it('падает на имя фото, когда в slug крепости нет', () => {
    expect(deriveAbv('fanagoriya-kaberne-krasnoe-suhoe', 'fanagoriya_kaberne_suhoe_135.webp')).toBe(
      13.5,
    )
  })

  it('трёхзначное «100» — это 10.0%, а не сто: иначе сломается 105 → 10.5', () => {
    expect(deriveAbv('x-beloe-suhoe-100', '')).toBe(10)
  })

  it('отбрасывает значения вне правдоподобного диапазона 4.5–22', () => {
    expect(deriveAbv('x-suhoe-30', '')).toBeNull()
    expect(deriveAbv('x-suhoe-99', '')).toBeNull()
    expect(deriveAbv('x-suhoe-40', '')).toBeNull()
  })

  it('год в конце названия не принимается за крепость', () => {
    expect(deriveAbv('vino-2024', '')).toBeNull()
    expect(deriveAbv('aligote-barrel-2024', '')).toBeNull()
  })

  it('возвращает null, когда хвоста нет', () => {
    expect(deriveAbv('aligote-barrel', '')).toBeNull()
  })
})

describe('deriveSparkling', () => {
  it('ловит игристое и брют', () => {
    expect(deriveSparkling('', 'abrau-igristoe-bryut-beloe')).toBe(true)
    expect(deriveSparkling('ЗБ вайн СПУМАНТЕ', 'zb-vajn-spumante')).toBe(true)
  })

  it('тихое вино не считает игристым', () => {
    expect(deriveSparkling('Саперави', 'saperavi-krasnoe-suhoe-14')).toBe(false)
  })
})

describe('deriveColorFamily', () => {
  it('сводит свободный текст к семейству', () => {
    expect(deriveColorFamily('Светло-соломенный')).toBe('Соломенный')
    expect(deriveColorFamily('Тёмно-рубиновый')).toBe('Рубиновый')
    expect(deriveColorFamily('Нежно-розовый')).toBe('Розовый')
  })

  it('непонятное не выдумывает', () => {
    expect(deriveColorFamily('Цвет свежего сена с бликами')).toBe('Прочее')
  })
})

describe('splitGrapes', () => {
  it('разбирает купаж', () => {
    expect(splitGrapes('Алиготе, Кокур Белый, Сары Пандас')).toEqual([
      'Алиготе',
      'Кокур Белый',
      'Сары Пандас',
    ])
  })

  it('пустое поле даёт пустой список', () => {
    expect(splitGrapes('')).toEqual([])
  })
})
