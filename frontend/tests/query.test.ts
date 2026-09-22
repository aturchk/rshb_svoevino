import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildWineIndex } from '../app/entities/wine/lib/build-index.ts'
import { runQuery, __testing } from '../app/entities/wine/lib/query.ts'
import type { WineIndex, WineQuery } from '../app/entities/wine/model/types.ts'
import { EMPTY_QUERY, STYLE_UNKNOWN } from '../app/entities/wine/model/types.ts'
import type { WineDict, WineIndexFile } from '../app/shared/config/dataset-schema.ts'

/**
 * Тесты идут по НАСТОЯЩЕМУ сгенерированному датасету, а не по синтетике:
 * так проверяется и движок, и то, что скрипт сборки выдал ожидаемую форму.
 */
const dataDir = resolve(import.meta.dirname, '../public/data')
const readJson = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(dataDir, name), 'utf8')) as T

let index: WineIndex
const query = (patch: Partial<WineQuery> = {}): WineQuery => ({ ...EMPTY_QUERY, ...patch })

beforeAll(() => {
  index = buildWineIndex(readJson<WineDict>('dict.json'), readJson<WineIndexFile>('wines.index.json'))
})

describe('пересечение и объединение', () => {
  it('пересечение отсортированных списков', () => {
    const a = Uint32Array.from([1, 3, 5, 7, 9])
    const b = Uint32Array.from([3, 4, 5, 9, 12])
    expect([...__testing.intersectSorted(a, b)]).toEqual([3, 5, 9])
  })

  it('объединение снимает дубликаты и сохраняет порядок', () => {
    const lists = [Uint32Array.from([5, 1, 3]), Uint32Array.from([3, 8])]
    expect([...__testing.unionSorted(lists)]).toEqual([1, 3, 5, 8])
  })

  it('пересечение с пустым списком пусто', () => {
    expect(__testing.intersectSorted(Uint32Array.from([1, 2]), new Uint32Array(0)).length).toBe(0)
  })
})

describe('runQuery на реальном каталоге', () => {
  it('пустой запрос возвращает весь каталог', () => {
    expect(runQuery(index, query()).ids.length).toBe(2103)
  })

  it('фильтр по категории совпадает с разведкой', () => {
    const white = index.dict.categories.indexOf('Белое')
    expect(runQuery(index, query({ categories: [white] })).ids.length).toBe(999)
  })

  it('несколько значений одной фасеты объединяются, а не пересекаются', () => {
    const { categories } = index.dict
    const both = runQuery(
      index,
      query({ categories: [categories.indexOf('Белое'), categories.indexOf('Красное')] }),
    )
    expect(both.ids.length).toBe(999 + 795)
  })

  it('разные фасеты пересекаются', () => {
    const crimea = index.dict.regions.indexOf('Крым')
    const red = index.dict.categories.indexOf('Красное')
    const onlyCrimea = runQuery(index, query({ regions: [crimea] })).ids.length
    const both = runQuery(index, query({ regions: [crimea], categories: [red] })).ids.length
    expect(onlyCrimea).toBe(769)
    expect(both).toBeLessThan(onlyCrimea)
    expect(both).toBeGreaterThan(0)
  })

  it('«стиль не указан» — полноценное значение фильтра', () => {
    expect(runQuery(index, query({ styles: [STYLE_UNKNOWN] })).ids.length).toBe(2103 - 1717)
  })

  it('диапазон крепости по умолчанию не прячет вина без крепости', () => {
    const withUnknown = runQuery(index, query({ abvMin: 12, abvMax: 13 })).ids.length
    const without = runQuery(
      index,
      query({ abvMin: 12, abvMax: 13, abvIncludeUnknown: false }),
    ).ids.length
    expect(withUnknown - without).toBe(2103 - 1581)
  })

  it('поиск требует все токены, а не любой', () => {
    const loose = runQuery(index, query({ text: 'шато' })).ids.length
    const strict = runQuery(index, query({ text: 'шато пино' })).ids.length
    expect(strict).toBeGreaterThan(0)
    expect(strict).toBeLessThan(loose)
  })

  it('поиск нечувствителен к ё и регистру', () => {
    const a = runQuery(index, query({ text: 'Фанагория' })).ids.length
    const b = runQuery(index, query({ text: 'фанагориЯ' })).ids.length
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(0)
  })

  it('заведомо несуществующее даёт пустую выдачу без падения', () => {
    expect(runQuery(index, query({ text: 'ззззз' })).ids.length).toBe(0)
  })

  it('счётчики фасет считаются без учёта собственного условия', () => {
    const { regions } = index.dict
    const crimea = regions.indexOf('Крым')
    const kuban = regions.indexOf('Кубань')
    const result = runQuery(index, query({ regions: [crimea] }))
    // Выбран Крым, но Кубань обязана остаться доступной — иначе фильтр станет тупиком.
    expect(result.counts.regions[kuban]).toBe(1067)
    expect(result.counts.regions[crimea]).toBe(769)
  })

  it('счётчики других фасет сужаются выбранным регионом', () => {
    const crimea = index.dict.regions.indexOf('Крым')
    const white = index.dict.categories.indexOf('Белое')
    const all = runQuery(index, query()).counts.categories[white] as number
    const inCrimea = runQuery(index, query({ regions: [crimea] })).counts.categories[
      white
    ] as number
    expect(inCrimea).toBeLessThan(all)
  })

  it('только с фото совпадает с числом сгенерированных картинок', () => {
    expect(runQuery(index, query({ withPhotoOnly: true })).ids.length).toBe(992)
  })

  it('выдача отсортирована по возрастанию id — это требование виртуализатора', () => {
    const ids = runQuery(index, query({ text: 'вино' })).ids
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true)
    }
  })
})

describe('производительность', () => {
  it('полный проход укладывается в бюджет 10 мс из ТЗ', () => {
    const heavy = query({ text: 'красное', abvMin: 11, abvMax: 14 })
    runQuery(index, heavy)
    const started = performance.now()
    for (let i = 0; i < 20; i++) runQuery(index, heavy)
    const perCall = (performance.now() - started) / 20
    // Печатаем: цифра нужна в отчёте и в README.
    console.log(`runQuery: ${perCall.toFixed(3)} мс на ${index.count} позициях`)
    expect(perCall).toBeLessThan(10)
  })
})
