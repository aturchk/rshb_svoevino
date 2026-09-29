import { IMG_THUMB } from '@/shared/config/dataset-schema'

import type { SimilarWine, WineIndex, WineSummary } from '../model/types'
import { STYLE_UNKNOWN } from '../model/types'
import type { SimilarMatch } from './similarity'

/** Короткая карточка прямо из индекса: детальный файл для ленты не нужен. */
export function summarize(index: WineIndex, id: number): WineSummary {
  const slug = index.slugs[id] as string
  const style = index.style[id] as number
  const abv = index.abv[id] as number
  return {
    slug,
    name: index.names[id] as string,
    winery: index.dict.wineries[index.winery[id] as number] ?? '',
    category: index.dict.categories[index.category[id] as number] ?? '',
    style: style === STYLE_UNKNOWN ? null : (index.dict.styles[style] ?? null),
    sparkling: index.sparkling[id] === 1,
    // Float32 в индексе: 13.1 хранится как 13.100000381… — в JSON уходят десятые.
    abv: Number.isNaN(abv) ? null : Math.round(abv * 10) / 10,
    image:
      index.hasImage[id] === 1
        ? {
            src: `/${IMG_THUMB(slug)}`,
            width: index.imgWidth[id] as number,
            height: index.imgHeight[id] as number,
          }
        : null,
  }
}

export function toSimilarWine(index: WineIndex, match: SimilarMatch): SimilarWine {
  return {
    ...summarize(index, match.id),
    reasons: match.reasons.map((reason) => reason.label),
  }
}
