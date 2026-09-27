import type { Wine } from '@/entities/wine'

import type { PairingTraits } from '../model/types'

/** Признаки для правил прямо из карточки вина. */
export function pairingTraitsOf(wine: Wine): PairingTraits {
  return {
    name: wine.name,
    category: wine.category,
    style: wine.style,
    sparkling: wine.sparkling,
    fortified: wine.fortified,
    oak: wine.oak,
    sweetHint: wine.sweetHint,
    abv: wine.abv,
    grapes: wine.grapeKeys,
  }
}
