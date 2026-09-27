import { createHash } from 'node:crypto'

import type { RecognizeResult, RecognizeStatus, ScanCandidate } from '@/entities/scan/model/types'
import { findSimilar, seriesKeyOf, traitsOf } from '@/entities/wine/lib/similarity'
import { summarize, toSimilarWine } from '@/entities/wine/lib/summary'
import type { WineCard, WineIndex } from '@/entities/wine/model/types'

import { useCatalog, loadWineDetail } from './catalog'
import { attributeSimilarWines } from './similar-wines'

/**
 * Демо-режим распознавания (NUXT_PUBLIC_DEMO_SCAN=true). НЕ распознаёт этикетку:
 * берёт вино каталога по хэшу снимка и прогоняет один из трёх исходов, чтобы
 * интерфейс можно было показать до готовности CV-модели. Ответ помечен demo: true,
 * и интерфейс это пишет. Эндпоинт скрипта оценки демо-режим не использует никогда.
 *
 * Вина берутся из тех, у которых есть фотография: на показе видно бутылку.
 * Кандидаты для «не уверены» — вина той же винодельни, в первую очередь той же серии:
 * именно такие почти-дубли (другой год, другой сахар) — главный источник ошибок
 * настоящего распознавания, и на них проверяется UX выбора.
 */

const STATUSES: readonly RecognizeStatus[] = ['matched', 'low_confidence', 'not_found']
const SIMILAR_IN_CARD = 5

function hashOf(image: Uint8Array): number {
  return createHash('sha1').update(image).digest().readUInt32BE(0)
}

function withPhoto(index: WineIndex): number[] {
  const ids: number[] = []
  for (let id = 0; id < index.count; id++) if (index.hasImage[id] === 1) ids.push(id)
  return ids
}

/** Почти-дубли для «Это не то вино?»: та же серия, потом та же винодельня и цвет. */
function confusables(index: WineIndex, id: number, limit: number): number[] {
  const winery = index.winery[id] as number
  const series = seriesKeyOf(index.names[id] as string, winery)
  const ranked: { id: number; rank: number }[] = []
  for (const other of index.postings.winery[winery] ?? []) {
    if (other === id) continue
    const rank =
      (seriesKeyOf(index.names[other] as string, winery) === series ? 2 : 0) +
      (index.category[other] === index.category[id] ? 1 : 0) +
      (index.style[other] === index.style[id] ? 0.5 : 0)
    ranked.push({ id: other, rank })
  }
  ranked.sort((a, b) => b.rank - a.rank || a.id - b.id)
  const picked = ranked.slice(0, limit).map((item) => item.id)
  if (picked.length < limit) {
    const fill = findSimilar(index, traitsOf(index, id), {
      limit: limit - picked.length,
      exclude: [id, ...picked],
    })
    picked.push(...fill.map((match) => match.id))
  }
  return picked
}

async function cardOf(slug: string): Promise<WineCard | null> {
  const detail = await loadWineDetail(slug)
  if (!detail) return null
  return { ...detail, similar: await attributeSimilarWines.forWine(slug, SIMILAR_IN_CARD) }
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export async function demoRecognize(
  image: Uint8Array,
  requested: RecognizeStatus | null,
): Promise<RecognizeResult> {
  const started = performance.now()
  const { index } = await useCatalog()
  const hash = hashOf(image)
  const pool = withPhoto(index)
  const id = pool[hash % pool.length] as number
  const status = requested ?? (STATUSES[hash % STATUSES.length] as RecognizeStatus)
  const slug = index.slugs[id] as string

  const candidate = (other: number, score: number): ScanCandidate => ({
    ...summarize(index, other),
    score: round(score),
  })

  let result: Omit<RecognizeResult, 'latencyMs' | 'demo'>
  if (status === 'matched') {
    const top = 0.93 + (hash % 50) / 1000
    const rest = findSimilar(index, traitsOf(index, id), { limit: 4, exclude: [id] })
    const candidates = rest.map((match, position) => candidate(match.id, 0.42 - position * 0.05))
    result = {
      status,
      top1: { slug, score: round(top) },
      top5: [
        { slug, score: round(top) },
        ...candidates.map(({ slug: s, score }) => ({ slug: s, score })),
      ],
      confidence: { top1: round(top), margin: round(top - (candidates[0]?.score ?? 0)) },
      card: await cardOf(slug),
      candidates,
      analogs: [],
    }
  } else if (status === 'low_confidence') {
    const top = 0.56 + (hash % 40) / 1000
    const candidates = confusables(index, id, 3).map((other, position) =>
      candidate(other, top - 0.05 - position * 0.05),
    )
    result = {
      status,
      top1: { slug, score: round(top) },
      top5: [
        { slug, score: round(top) },
        ...candidates.map(({ slug: s, score }) => ({ slug: s, score })),
      ],
      confidence: { top1: round(top), margin: round(top - (candidates[0]?.score ?? 0)) },
      card: await cardOf(slug),
      candidates,
      analogs: [],
    }
  } else {
    // «Не нашли»: выбранное вино играет роль бутылки, которой нет в каталоге,
    // и само в ответ не попадает — только похожие на него.
    const analogs = findSimilar(index, traitsOf(index, id), { limit: 5, exclude: [id] })
    const weak = analogs.slice(0, 4).map((match, position) => ({
      slug: index.slugs[match.id] as string,
      score: round(0.24 - position * 0.03),
    }))
    result = {
      status: 'not_found',
      top1: null,
      top5: weak,
      confidence: { top1: weak[0]?.score ?? null, margin: null },
      card: null,
      candidates: [],
      analogs: analogs.map((match) => toSimilarWine(index, match)),
    }
  }

  // Демо ждёт правдоподобное время ответа, чтобы была видна анимация распознавания;
  // SLA из ТЗ — до 3 секунд, здесь 0.9–1.7 с.
  const target = 900 + (hash % 800)
  const spent = performance.now() - started
  if (spent < target) await new Promise((resolve) => setTimeout(resolve, target - spent))

  return { ...result, latencyMs: Math.round(performance.now() - started), demo: true }
}
