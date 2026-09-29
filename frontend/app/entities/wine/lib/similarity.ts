import { normalizeSearchText } from '@/shared/lib/normalize'

import type { WineIndex } from '../model/types'
import { STYLE_UNKNOWN } from '../model/types'

/**
 * Похожие вина по признакам каталога. Чистая функция над колоночным индексом:
 * работает и на сервере (карточка, «не нашли»), и в тестах на настоящем датасете.
 *
 * Это реализация по умолчанию для шва SimilarWinesProvider. Когда появятся
 * SigLIP-эмбеддинги этикеток в pgvector, ранжирование заменится ближайшими соседями,
 * а правила ниже останутся фильтром: эмбеддинг не знает, что брют к сухому ближе,
 * чем к полусладкому.
 *
 * Что учитывается и почему так:
 *  - группа — фильтр: категория, креплёность, игристость и сахар дальше чем на шаг.
 *    Белое вместо красного, тихое вместо брюта и сухое вместо сладкого аналогами
 *    не бывают. Другие группы добирают только тонкие ячейки, и строго после своих;
 *  - сахар — по шкале сладости, а не по индексу стиля (порядок в словаре — не шкала);
 *  - сорт — главный сигнал, с частичным зачётом родственных сортов;
 *  - крепость — близость как прокси тела;
 *  - регион — слабый сигнал: 87% каталога — Кубань и Крым.
 * Приоритет у других виноделен: сначала по одному вину от разных виноделен среди
 * сильных кандидатов; вино той же винодельни, что и исходное, — одно и в конце списка.
 */

/** Цель подбора в координатах индекса. null — признак неизвестен и не учитывается. */
export interface SimilarityTarget {
  category: number | null
  /** индекс dict.styles */
  style: number | null
  sparkling: boolean | null
  fortified: boolean | null
  abv: number | null
  /** индексы dict.grapeKeys */
  grapes: readonly number[]
  region: number | null
  winery: number | null
  /** «Имя серии» исходного вина: его другие годы и объёмы не предлагаем как похожие. */
  seriesKey: string | null
}

export type SimilarityReasonCode = 'grape' | 'grape-family' | 'style' | 'region' | 'abv'

export interface SimilarityReason {
  code: SimilarityReasonCode
  label: string
}

export interface SimilarMatch {
  id: number
  score: number
  reasons: SimilarityReason[]
}

export interface SimilarOptions {
  limit?: number
  /** позиции, которые не предлагать: само вино, уже показанные кандидаты */
  exclude?: readonly number[]
}

const WEIGHT = {
  grapes: 0.34,
  sweetness: 0.3,
  abv: 0.12,
  region: 0.08,
} as const

const SAME_WINERY_PENALTY = 0.08
/** Сахар неизвестен: зачёт ниже, чем у соседа по шкале (0.45), — 84% известных сухие. */
const UNKNOWN_SWEETNESS = 0.35
/** «Сильный» кандидат — не слабее этой доли лучшего: только среди них действует
 *  правило «по одному от винодельни», иначе слабое вино новой винодельни вытесняет
 *  почти точное совпадение. */
const STRONG_SHARE = 0.8

/** Сладость по ГОСТ: брют и экстра брют — сухие игристые. */
const SWEETNESS: Readonly<Record<string, number>> = {
  'Экстра брют': 0,
  Брют: 0,
  Сухое: 0,
  Полусухое: 1,
  Полусладкое: 2,
  Сладкое: 3,
}
const SWEETNESS_SIMILARITY = [1, 0.45, 0.15, 0] as const

/**
 * Родственные сорта: разные по ампелографии, но близкие для покупателя.
 * Совпадение семейства засчитывается как 0.6 совпадения сорта.
 */
const FAMILIES = ['мускат', 'красностоп', 'бастардо', 'кокур', 'саперави', 'цимлянск', 'рислинг']
const FAMILY_CREDIT = 0.6

/**
 * Серия без года, объёма, сахара и цвета: «Primum Alveus Brut 2016» и «Primum Alveus
 * Extra Brut 2017» — одна линейка, а не похожие вина.
 */
const SERIES_NOISE = new Set([
  'брют',
  'экстра',
  'extra',
  'brut',
  'nature',
  'натюр',
  'сухое',
  'полусухое',
  'полусладкое',
  'сладкое',
  'semi',
  'sweet',
  'dry',
  'белое',
  'красное',
  'розовое',
  'оранжевое',
  'rose',
  'розе',
  'игристое',
  'тихое',
])

const ABV_SPAN = 3
const ABV_CLOSE = 0.5
const DEFAULT_LIMIT = 5

function familyOf(grape: string): string | null {
  const lower = grape.toLowerCase()
  return FAMILIES.find((family) => lower.startsWith(family)) ?? null
}

/** Серия: «David 2021» и «David 2022» — одно вино, «Katharon Brut» и «Katharon Semi-Sweet» — одна линейка. */
export function seriesKeyOf(name: string, winery: number): string {
  const base = normalizeSearchText(name)
    .replace(/\b0 \d{1,2}\b/g, ' ')
    .split(' ')
    .filter((token) => token && !SERIES_NOISE.has(token) && !/^(19|20)\d{2}$/.test(token))
    .join(' ')
  return `${winery}:${base}`
}

function sweetnessOf(index: WineIndex, style: number | null): number | null {
  if (style === null || style === STYLE_UNKNOWN) return null
  const label = index.dict.styles[style]
  return label === undefined ? null : (SWEETNESS[label] ?? null)
}

export function traitsOf(index: WineIndex, id: number): SimilarityTarget {
  const abv = index.abv[id] as number
  const style = index.style[id] as number
  const winery = index.winery[id] as number
  return {
    category: index.category[id] as number,
    style: style === STYLE_UNKNOWN ? null : style,
    sparkling: index.sparkling[id] === 1,
    fortified: index.fortified[id] === 1,
    // Float32 в индексе: 13.1 хранится как 13.100000381… — округляем до десятых.
    abv: Number.isNaN(abv) ? null : Math.round(abv * 10) / 10,
    grapes: index.grapeKeys[id] ?? [],
    region: index.region[id] as number,
    winery,
    seriesKey: seriesKeyOf(index.names[id] as string, winery),
  }
}

/** Детерминированный «шум» для равных оценок: иначе при одинаковом счёте всегда выигрывает алфавит. */
function jitter(id: number, seed: number): number {
  let hash = (id + 1) * 2654435761 + seed
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff
}

function seedOf(target: SimilarityTarget): number {
  const text = [
    target.category,
    target.style,
    target.sparkling,
    target.abv,
    target.region,
    target.winery,
    ...target.grapes,
  ].join('|')
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

interface GrapeMatch {
  similarity: number
  shared: string[]
  family: string | null
}

function compareGrapes(
  index: WineIndex,
  target: readonly number[],
  candidate: readonly number[],
): GrapeMatch {
  if (target.length === 0 || candidate.length === 0) {
    return { similarity: 0, shared: [], family: null }
  }
  const keys = index.dict.grapeKeys
  const shared: string[] = []
  let family: string | null = null
  let matches = 0
  // Каждый сорт исходного вина засчитывается один раз: иначе купаж трёх мускатов
  // «похож» на моносорт сильнее, чем точно такой же моносорт.
  const unmatched = new Set(target)
  for (const grape of candidate) {
    if (!unmatched.has(grape)) continue
    unmatched.delete(grape)
    matches += 1
    shared.push(keys[grape] as string)
  }
  for (const grape of candidate) {
    if (target.includes(grape)) continue
    const candidateFamily = familyOf(keys[grape] ?? '')
    if (candidateFamily === null) continue
    const own = [...unmatched].find((item) => familyOf(keys[item] ?? '') === candidateFamily)
    if (own === undefined) continue
    unmatched.delete(own)
    matches += FAMILY_CREDIT
    family ??= keys[grape] as string
  }
  if (matches === 0) return { similarity: 0, shared, family }
  // Смесь Жаккара и коэффициента перекрытия: моносорт и купаж с этим сортом
  // похожи, но меньше, чем два моносорта.
  const jaccard = matches / (target.length + candidate.length - matches)
  const overlap = matches / Math.min(target.length, candidate.length)
  return { similarity: Math.min(1, 0.5 * jaccard + 0.5 * overlap), shared, family }
}

function styleLabel(index: WineIndex, id: number): string {
  const category = (index.dict.categories[index.category[id] as number] ?? '').toLowerCase()
  const style = index.style[id] as number
  const styleName = style === STYLE_UNKNOWN ? '' : (index.dict.styles[style] ?? '').toLowerCase()
  if (index.sparkling[id] === 1 && (styleName === 'брют' || styleName === 'экстра брют')) {
    return `${category.replace(/ое$/, 'ый')} ${styleName}`.trim()
  }
  return `${category} ${styleName}`.trim()
}

function formatAbv(value: number): string {
  return `${String(Math.round(value * 10) / 10).replace('.', ',')}%`
}

interface Scored {
  id: number
  score: number
  reasons: SimilarityReason[]
  winery: number
  series: string
}

function scoreCandidate(
  index: WineIndex,
  target: SimilarityTarget,
  targetSweetness: number | null,
  id: number,
  seed: number,
): Scored {
  const winery = index.winery[id] as number
  const reasons: SimilarityReason[] = []
  let score = 0

  const grapes = compareGrapes(index, target.grapes, index.grapeKeys[id] ?? [])
  score += WEIGHT.grapes * grapes.similarity
  if (grapes.shared.length > 0) {
    const label =
      grapes.shared.length === 1
        ? `Тот же сорт: ${grapes.shared[0]}`
        : `Те же сорта: ${grapes.shared.slice(0, 2).join(', ')}`
    reasons.push({ code: 'grape', label })
  } else if (grapes.family) {
    reasons.push({ code: 'grape-family', label: `Родственный сорт: ${grapes.family}` })
  }

  const sweetness = sweetnessOf(index, index.style[id] as number)
  if (targetSweetness !== null && sweetness !== null) {
    const distance = Math.min(Math.abs(targetSweetness - sweetness), 3)
    score += WEIGHT.sweetness * (SWEETNESS_SIMILARITY[distance] ?? 0)
    // «Тоже» — только когда стиль совпал буквально: брют — не «тоже экстра брют».
    // У подбора по описанию исходного вина нет — там просто «Красное сухое».
    if (target.style === index.style[id] && target.category === index.category[id]) {
      const kind = styleLabel(index, id)
      const label = target.seriesKey === null ? kind.replace(/^./, (c) => c.toUpperCase()) : `Тоже ${kind}`
      reasons.push({ code: 'style', label })
    }
  } else {
    score += WEIGHT.sweetness * UNKNOWN_SWEETNESS
  }

  const abv = index.abv[id] as number
  if (target.abv !== null && !Number.isNaN(abv)) {
    const delta = Math.abs(target.abv - abv)
    score += WEIGHT.abv * Math.max(0, 1 - delta / ABV_SPAN)
    if (delta <= ABV_CLOSE) reasons.push({ code: 'abv', label: `Крепость ${formatAbv(abv)}` })
  } else {
    score += WEIGHT.abv * 0.4
  }

  if (target.region !== null && target.region === index.region[id]) {
    score += WEIGHT.region
    reasons.push({ code: 'region', label: `Тоже ${index.dict.regions[target.region]}` })
  }

  if (target.winery !== null && target.winery === winery) score -= SAME_WINERY_PENALTY

  // Тай-брейки: фото в выдаче полезнее силуэта, дальше — детерминированный шум.
  score += index.hasImage[id] === 1 ? 0.004 : 0
  score += jitter(id, seed) * 0.002

  return {
    id,
    score,
    reasons,
    winery,
    series: seriesKeyOf(index.names[id] as string, winery),
  }
}

interface PickState {
  picked: Scored[]
  byWinery: Map<number, number>
  series: Set<string>
}

interface Pass {
  /** сколько вин одной (чужой) винодельни */
  perWinery: number
  /** допускать ли вино винодельни исходного вина */
  ownWinery: boolean
  /** нижняя граница оценки */
  floor: number
}

/**
 * Отбор с ограничениями, проходами от строгого к мягкому:
 *  1–2. сильные кандидаты: по одному, затем по два от чужой винодельни;
 *  3–5. все остальные, в том же порядке, и только здесь — одно вино своей винодельни.
 * Серия исходного вина и повторы серий не берутся никогда.
 */
function pickInto(
  state: PickState,
  ranked: readonly Scored[],
  target: SimilarityTarget,
  limit: number,
): void {
  const strong = (ranked[0]?.score ?? 0) * STRONG_SHARE
  const passes: Pass[] = [
    { perWinery: 1, ownWinery: false, floor: strong },
    { perWinery: 2, ownWinery: false, floor: strong },
    { perWinery: 1, ownWinery: true, floor: Number.NEGATIVE_INFINITY },
    { perWinery: 2, ownWinery: true, floor: Number.NEGATIVE_INFINITY },
    { perWinery: Number.POSITIVE_INFINITY, ownWinery: true, floor: Number.NEGATIVE_INFINITY },
  ]
  for (const pass of passes) {
    for (const item of ranked) {
      if (state.picked.length >= limit) return
      if (item.score < pass.floor || state.series.has(item.series)) continue
      const own = target.winery !== null && item.winery === target.winery
      if (own && !pass.ownWinery) continue
      const count = state.byWinery.get(item.winery) ?? 0
      if (count >= (own ? 1 : pass.perWinery)) continue
      state.byWinery.set(item.winery, count + 1)
      state.series.add(item.series)
      state.picked.push(item)
    }
  }
}

export function findSimilar(
  index: WineIndex,
  target: SimilarityTarget,
  options: SimilarOptions = {},
): SimilarMatch[] {
  const limit = options.limit ?? DEFAULT_LIMIT
  const exclude = new Set(options.exclude ?? [])
  const seed = seedOf(target)
  const targetSweetness = sweetnessOf(index, target.style)

  const same: Scored[] = []
  const other: Scored[] = []
  for (let id = 0; id < index.count; id++) {
    if (exclude.has(id)) continue
    const sweetness = sweetnessOf(index, index.style[id] as number)
    const sameGroup =
      (target.category === null || index.category[id] === target.category) &&
      (target.fortified === null || (index.fortified[id] === 1) === target.fortified) &&
      (target.sparkling === null || (index.sparkling[id] === 1) === target.sparkling) &&
      (targetSweetness === null || sweetness === null || Math.abs(targetSweetness - sweetness) <= 1)
    ;(sameGroup ? same : other).push(scoreCandidate(index, target, targetSweetness, id, seed))
  }
  const byScore = (a: Scored, b: Scored) => b.score - a.score

  const state: PickState = {
    picked: [],
    byWinery: new Map(),
    series: new Set(target.seriesKey ? [target.seriesKey] : []),
  }
  pickInto(state, same.sort(byScore), target, limit)
  const fromSame = state.picked.length
  // Тонкие ячейки (оранжевых вин 16 на весь каталог): добираем из других групп.
  if (fromSame < limit) pickInto(state, other.sort(byScore), target, limit)

  // Показываем по убыванию оценки внутри своей группы, затем добор; вино той же
  // винодельни — последним в своей группе: приоритет у аналогов других виноделен.
  const own = (item: Scored) => (target.winery !== null && item.winery === target.winery ? 1 : 0)
  const order = (a: Scored, b: Scored) => own(a) - own(b) || b.score - a.score
  const result = [
    ...state.picked.slice(0, fromSame).sort(order),
    ...state.picked.slice(fromSame).sort(order),
  ]

  return result.map(({ id, score: value, reasons }) => ({
    id,
    score: Math.round(value * 1000) / 1000,
    reasons: reasons.slice(0, 3),
  }))
}
