import { describe, expect, it } from 'vitest'

import {
  deriveAbv,
  deriveColorFamily,
  deriveFortified,
  deriveOak,
  deriveSparkling,
  deriveStyle,
  splitGrapes,
} from '../scripts/lib/derive.ts'
import { canonicalGrapes } from '../scripts/lib/grapes.ts'
import { extractPairingNote } from '../scripts/lib/pairing-note.ts'

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

describe('deriveStyle: латиница на этикетке', () => {
  it('Extra Brut не схлопывается в брют', () => {
    expect(deriveStyle('Primum Alveus Extra Brut', 'primum-alveus-extra-brut')).toBe('Экстра брют')
  })

  it('Semi-Sweet и Semi-Dry', () => {
    expect(deriveStyle('Katharon Semi-Sweet', 'katharon-semi-sweet')).toBe('Полусладкое')
    expect(deriveStyle('ZB Frizzante Semi-Dry Rose', 'zb-frizzante-semi-dry-rose')).toBe(
      'Полусухое',
    )
  })

  it('Brut как отдельное слово, а не часть другого', () => {
    expect(deriveStyle('Cantiani Brut', 'cantiani-brut')).toBe('Брют')
    expect(deriveStyle('Brutal Red', 'brutal-red')).toBeNull()
  })
})

describe('deriveSparkling: латинские маркеры и описание', () => {
  it('Blanc de Blancs, Frizzante, Pet-Nat — игристые', () => {
    expect(deriveSparkling('Mantra Blanc de Blancs', 'mantra-blanc-de-blancs')).toBe(true)
    expect(deriveSparkling('ZB Frizzante Dry', 'zb-frizzante-dry')).toBe(true)
    expect(deriveSparkling('VIBES, Silvaner Pet-Nat 2022', 'silvaner-pet-nat-2022')).toBe(true)
    expect(deriveSparkling('Пет Нат Соседи', 'pet-nat-sosedi')).toBe(true)
  })

  it('Blanc de Neige — тихое вино, несмотря на «blanc de»', () => {
    expect(
      deriveSparkling('Blanc de Neige', 'loco-cimbali-blanc-de-neige-shardone-beloe-suhoe-131'),
    ).toBe(false)
  })

  it('перляж и метод Шарма в описании — игристое', () => {
    expect(deriveSparkling('Новый Свет. Шардоне', 'x', 'Вино с изящным длительным перляжем.')).toBe(
      true,
    )
    expect(deriveSparkling('Полусладкое Белое', 'x', 'Создано методом Шарма-Мартинотти.')).toBe(
      true,
    )
    expect(deriveSparkling('Эндемы', 'x', 'Элегантное игристое вино, свежее.')).toBe(true)
  })

  it('«лёгкая игристость» тихого вина не делает его игристым', () => {
    expect(
      deriveSparkling('Sesto Senso', 'x', 'Вкус тонкий, свежий, с легкой пикантной игристостью.'),
    ).toBe(false)
  })
})

describe('deriveAbv: мусорные хвосты', () => {
  it('год в хвосте без маркера вина не становится крепостью', () => {
    expect(deriveAbv('daniel-22', 'Daniel 2022 Коффманн.webp')).toBeNull()
  })

  it('номер скриншота не становится крепостью', () => {
    expect(deriveAbv('kaberne-sovinon-2', 'Screenshot_19.webp')).toBeNull()
    expect(deriveAbv('merlo-litavshhuk', 'image-04-09-26-01-21.webp')).toBeNull()
  })

  it('имя фото с маркером по-прежнему читается', () => {
    expect(
      deriveAbv('chenin-blanc-oleg-repin', 'oleg-repin-shenen-blan-beloe-suhoe-125.webp'),
    ).toBe(12.5)
  })
})

describe('deriveFortified', () => {
  it('портвейн, мадера, херес, кагор, солера — креплёные', () => {
    expect(deriveFortified('Портвейн белый Алушта', 'x', 'Сладкое', 17)).toBe(true)
    expect(deriveFortified('Мадера Крымская', 'madera-krymskaya', null, null)).toBe(true)
    expect(deriveFortified('Массандра Херес', 'massandra-heres', null, null)).toBe(true)
    expect(deriveFortified('Кагор Гурзуф', 'x', 'Сладкое', 16)).toBe(true)
    expect(deriveFortified('Solera. Saperavi Ruby', 'x', 'Сухое', 16)).toBe(true)
    expect(deriveFortified('Порто Солнечной Долины', 'x', 'Сладкое', 17.5)).toBe(true)
  })

  it('сладкое от 15% — десертное, креплёное', () => {
    expect(deriveFortified('Мускат десертный', 'x', 'Сладкое', 16)).toBe(true)
  })

  it('сухое красное на 15.5% — не креплёное, а просто плотное', () => {
    expect(deriveFortified('Pelle Calda', 'x', 'Сухое', 15.5)).toBe(false)
  })

  it('«Портофино» и подобные не ловятся по подстроке «порто»', () => {
    expect(deriveFortified('Портофино', 'portofino', 'Сухое', 12)).toBe(false)
  })
})

describe('canonicalGrapes', () => {
  it('сводит синонимы одного сорта', () => {
    expect(canonicalGrapes(['Шираз'])).toEqual(['Сира'])
    expect(canonicalGrapes(['Рислинг Рейнский'])).toEqual(['Рислинг'])
    expect(canonicalGrapes(['Пино Гриджио'])).toEqual(['Пино Гри'])
  })

  it('убирает дубли после сведения', () => {
    expect(canonicalGrapes(['Сира', 'Шираз'])).toEqual(['Сира'])
  })

  it('заглушки «Белые сорта винограда» — это «сорт неизвестен»', () => {
    expect(canonicalGrapes(['Белые сорта винограда'])).toEqual([])
  })

  it('делит две записи в одной строке', () => {
    expect(canonicalGrapes(['Пино чёрный (Пино нуар) и Мерло'])).toEqual(['Пино Нуар', 'Мерло'])
  })

  it('родственные, но разные сорта не сливает', () => {
    expect(canonicalGrapes(['Бастардо Магарачский'])).toEqual(['Бастардо Магарачский'])
    expect(canonicalGrapes(['Красностоп Анапский'])).toEqual(['Красностоп Анапский'])
  })
})

describe('extractPairingNote', () => {
  it('берёт фразу о подаче дословно', () => {
    expect(
      extractPairingNote('Вкус: плотный, с нотами вишни. К красному мясу, выдержанным сырам.'),
    ).toBe('К красному мясу, выдержанным сырам.')
  })

  it('аперитив — тоже рекомендация', () => {
    expect(extractPairingNote('Свежее, яркое. Идеальный аперитив.')).toBe('Идеальный аперитив.')
  })

  it('режет предложение от метки «Сочетания:», если перед ней нет точки', () => {
    expect(extractPairingNote('Умеренная сладость Сочетания: утка с ягодным соусом, сыры.')).toBe(
      'Сочетания: утка с ягодным соусом, сыры.',
    )
  })

  it('«сочетание ароматов» и букет — не гастрономия', () => {
    expect(extractPairingNote('Тона вишни в сочетании с выпечкой в послевкусии.')).toBeNull()
    expect(
      extractPairingNote('Кислинка отлично сочетается с деликатной фруктовой сладостью.'),
    ).toBeNull()
    expect(extractPairingNote('Вкус хорошо сбалансированный, с мягкими танинами.')).toBeNull()
  })

  it('нет фразы — null, а не выдумка', () => {
    expect(extractPairingNote('Вкус: ягодно-фруктовый.')).toBeNull()
  })
})

describe('deriveOak', () => {
  it('выдержка в дубе и барриках', () => {
    expect(deriveOak('Мерло', 'Выдержка в дубе 18 месяцев.')).toBe(true)
    expect(deriveOak('Бельбек Ркацители Баррик', 'Аромат жёлтых яблок.')).toBe(true)
    expect(deriveOak('Каберне', 'Выдерживается в дубовых бочках.')).toBe(true)
  })

  it('«без выдержки в дубе» — не дуб', () => {
    expect(deriveOak('Nature. Orange', 'Без выдержки в дубе. Выдержка на мезге.')).toBe(false)
  })

  it('«Дубровский» — не дуб', () => {
    expect(deriveOak('Дубровский. Bordeaux Blend', 'В аромате чёрные ягоды.')).toBe(false)
  })
})
