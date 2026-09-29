import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildWineIndex } from '../app/entities/wine/lib/build-index.ts'
import { findSimilar, seriesKeyOf, traitsOf } from '../app/entities/wine/lib/similarity.ts'
import type { SimilarityTarget } from '../app/entities/wine/lib/similarity.ts'
import type { WineIndex } from '../app/entities/wine/model/types.ts'
import type { WineDict, WineIndexFile } from '../app/shared/config/dataset-schema.ts'

/** Как и тесты фильтрации — по настоящему сгенерированному каталогу. */
const dataDir = resolve(import.meta.dirname, '../public/data')
const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(dataDir, name), 'utf8')) as T

let index: WineIndex
const idOf = (slug: string): number => {
  const id = index.slugs.indexOf(slug)
  if (id === -1) throw new Error(`нет в каталоге: ${slug}`)
  return id
}
const similarTo = (slug: string, limit = 5) => {
  const id = idOf(slug)
  return findSimilar(index, traitsOf(index, id), { limit, exclude: [id] })
}
const category = (id: number) => index.dict.categories[index.category[id] as number]
const winery = (id: number) => index.winery[id] as number

beforeAll(() => {
  index = buildWineIndex(
    readJson<WineDict>('dict.json'),
    readJson<WineIndexFile>('wines.index.json'),
  )
})

describe('findSimilar на реальном каталоге', () => {
  const SAPERAVI = 'fanagoriya-pelle-calda-saperavi-krasnoe-suhoe-155'

  it('отдаёт запрошенное число вин и не предлагает само вино', () => {
    const result = similarTo(SAPERAVI)
    expect(result).toHaveLength(5)
    expect(result.map((match) => match.id)).not.toContain(idOf(SAPERAVI))
  })

  it('категория — фильтр: к красному только красные', () => {
    for (const match of similarTo(SAPERAVI)) expect(category(match.id)).toBe('Красное')
  })

  it('не больше одного вина той же винодельни, остальные — разные винодельни', () => {
    const source = winery(idOf(SAPERAVI))
    const result = similarTo(SAPERAVI)
    const wineries = result.map((match) => winery(match.id))
    expect(wineries.filter((value) => value === source).length).toBeLessThanOrEqual(1)
    expect(new Set(wineries).size).toBe(result.length)
  })

  it('сорт — главный сигнал: к сухому Саперави — Саперави', () => {
    const saperavi = index.dict.grapeKeys.indexOf('Саперави')
    const result = similarTo(SAPERAVI)
    const withGrape = result.filter((match) => index.grapeKeys[match.id]?.includes(saperavi))
    expect(withGrape.length).toBeGreaterThanOrEqual(4)
    expect(result[0]?.reasons.map((reason) => reason.code)).toContain('grape')
  })

  it('результаты отсортированы по убыванию оценки', () => {
    const scores = similarTo(SAPERAVI).map((match) => match.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('детерминированность: два вызова — одинаковый ответ', () => {
    expect(similarTo(SAPERAVI)).toEqual(similarTo(SAPERAVI))
  })

  it('игристое ищет игристые, тихое — тихие', () => {
    const brut = 'abrau-dyurso-brut-dor-blanc-de-blancs-shardone-beloe-bryut-12'
    for (const match of similarTo(brut)) expect(index.sparkling[match.id]).toBe(1)
    for (const match of similarTo(SAPERAVI)) expect(index.sparkling[match.id]).toBe(0)
  })

  it('креплёное ищет креплёные', () => {
    const port = index.slugs.findIndex((slug) => slug.includes('portveyn-krasnyy-livadiya'))
    const result = findSimilar(index, traitsOf(index, port), { exclude: [port] })
    const fortified = result.filter((match) => index.fortified[match.id] === 1)
    expect(fortified.length).toBe(5)
  })

  it('сладкое не подбирается к сухому', () => {
    const sweet = index.dict.styles.indexOf('Сладкое')
    for (const match of similarTo(SAPERAVI)) expect(index.style[match.id]).not.toBe(sweet)
  })

  it('почти-дубли одной серии (другой год) не выдаются как похожие', () => {
    // Серии с несколькими годами: у каждой — ни одного вина той же серии в выдаче.
    const seriesCount = new Map<string, number>()
    for (let id = 0; id < index.count; id++) {
      const key = seriesKeyOf(index.names[id] as string, winery(id))
      seriesCount.set(key, (seriesCount.get(key) ?? 0) + 1)
    }
    let checked = 0
    for (let id = 0; id < index.count && checked < 30; id++) {
      const key = seriesKeyOf(index.names[id] as string, winery(id))
      if ((seriesCount.get(key) ?? 0) < 2) continue
      checked += 1
      const result = findSimilar(index, traitsOf(index, id), { exclude: [id] })
      for (const match of result) {
        expect(seriesKeyOf(index.names[match.id] as string, winery(match.id))).not.toBe(key)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('каждое вино каталога получает 5 похожих, и все — из разрешённых категорий', () => {
    for (let id = 0; id < index.count; id++) {
      const result = findSimilar(index, traitsOf(index, id), { exclude: [id] })
      expect(result.length).toBe(5)
      const same = result.filter((match) => index.category[match.id] === index.category[id])
      // Чужая категория допустима только в тонких ячейках — и только после своих.
      const firstForeign = result.findIndex(
        (match) => index.category[match.id] !== index.category[id],
      )
      if (firstForeign !== -1) expect(same.length).toBe(firstForeign)
    }
  }, 45_000)
})

describe('findSimilar по частичным признакам', () => {
  const partial = (patch: Partial<SimilarityTarget>): SimilarityTarget => ({
    category: null,
    style: null,
    sparkling: null,
    fortified: false,
    abv: null,
    grapes: [],
    region: null,
    winery: null,
    seriesKey: null,
    ...patch,
  })

  it('«красное сухое» — только красные сухие, от разных виноделен', () => {
    const red = index.dict.categories.indexOf('Красное')
    const dry = index.dict.styles.indexOf('Сухое')
    const result = findSimilar(index, partial({ category: red, style: dry, sparkling: false }))
    expect(result).toHaveLength(5)
    for (const match of result) {
      expect(index.category[match.id]).toBe(red)
      expect(index.style[match.id]).toBe(dry)
    }
    expect(new Set(result.map((match) => winery(match.id))).size).toBe(5)
  })

  it('исключённые позиции не возвращаются', () => {
    const red = index.dict.categories.indexOf('Красное')
    const first = findSimilar(index, partial({ category: red }))
    const exclude = first.map((match) => match.id)
    const second = findSimilar(index, partial({ category: red }), { exclude })
    for (const match of second) expect(exclude).not.toContain(match.id)
  })

  it('причина «Тоже красное сухое» — человеческим языком', () => {
    const result = similarTo('fanagoriya-pelle-calda-saperavi-krasnoe-suhoe-155')
    const labels = result.flatMap((match) => match.reasons.map((reason) => reason.label))
    expect(labels).toContain('Тоже красное сухое')
  })
})

describe('seriesKeyOf', () => {
  it('год и объём не отличают вино', () => {
    expect(seriesKeyOf('David 2021', 3)).toBe(seriesKeyOf('David, 2022', 3))
    expect(seriesKeyOf('Кюве 0,75', 3)).toBe(seriesKeyOf('Кюве', 3))
  })

  it('разные винодельни — разные серии', () => {
    expect(seriesKeyOf('Каберне', 1)).not.toBe(seriesKeyOf('Каберне', 2))
  })
})

describe('регрессии из ревью', () => {
  const sweetnessOf = (id: number) =>
    ({ 'Экстра брют': 0, Брют: 0, Сухое: 0, Полусухое: 1, Полусладкое: 2, Сладкое: 3 })[
      index.dict.styles[index.style[id] as number] ?? ''
    ]

  it('игристое получает игристые аналоги, если в его цвете их достаточно', () => {
    for (let id = 0; id < index.count; id++) {
      if (index.sparkling[id] !== 1) continue
      const result = findSimilar(index, traitsOf(index, id), { exclude: [id] })
      const sameGroupPicks = result.filter(
        (match) => index.category[match.id] === index.category[id],
      )
      for (const match of sameGroupPicks.slice(0, 3)) expect(index.sparkling[match.id]).toBe(1)
    }
  })

  it('сладкому и полусладкому не подбираются известные сухие', () => {
    const sweet = index.dict.styles.indexOf('Сладкое')
    const semi = index.dict.styles.indexOf('Полусладкое')
    for (let id = 0; id < index.count; id++) {
      const style = index.style[id]
      if ((style !== sweet && style !== semi) || index.fortified[id] === 1) continue
      const result = findSimilar(index, traitsOf(index, id), { exclude: [id] })
      const sameCategory = result.filter((match) => index.category[match.id] === index.category[id])
      for (const match of sameCategory.slice(0, 3)) {
        const level = sweetnessOf(match.id)
        if (level !== undefined) expect(level).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('точный моносорт не проигрывает купажу родственных сортов', () => {
    const muscat = index.dict.grapeKeys.indexOf('Мускат Белый')
    const target: SimilarityTarget = {
      ...traitsOf(index, 0),
      category: index.dict.categories.indexOf('Белое'),
      style: index.dict.styles.indexOf('Сухое'),
      sparkling: false,
      fortified: false,
      grapes: [muscat],
      winery: null,
      seriesKey: null,
      abv: null,
      region: null,
    }
    const result = findSimilar(index, target, { limit: 3 })
    expect(index.grapeKeys[result[0]!.id]).toEqual([muscat])
  })

  it('по всему каталогу: оценки в своей группе идут по убыванию, своя винодельня — последней', () => {
    for (let id = 0; id < index.count; id += 7) {
      const target = traitsOf(index, id)
      const result = findSimilar(index, target, { exclude: [id] })
      const ownPosition = result.findIndex((match) => winery(match.id) === target.winery)
      if (ownPosition !== -1) {
        const sameCategoryAfter = result
          .slice(ownPosition + 1)
          .filter((match) => index.category[match.id] === index.category[id])
        expect(sameCategoryAfter).toHaveLength(0)
      }
      const others = result.filter(
        (match) =>
          winery(match.id) !== target.winery && index.category[match.id] === index.category[id],
      )
      const scores = others.map((match) => match.score)
      expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    }
  })

  it('линейка одной винодельни с разным сахаром — одна серия', () => {
    expect(seriesKeyOf('Primum Alveus Brut 2016', 1)).toBe(seriesKeyOf('Primum Alveus Extra Brut 2017', 1))
    expect(seriesKeyOf('Katharon Semi-Sweet', 1)).toBe(seriesKeyOf('Katharon Brut', 1))
  })
})

describe('адреса карточек', () => {
  it('каждый slug каталога проходит серверную проверку — включая подчёркивания', async () => {
    const { isValidSlug } = await import('../server/utils/catalog.ts')
    for (const slug of index.slugs) expect(isValidSlug(slug), slug).toBe(true)
    expect(isValidSlug('../nuxt.config')).toBe(false)
  })
})
