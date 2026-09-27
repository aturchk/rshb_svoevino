/** Подписи вина для интерфейса — одинаковые в ленте, карточке и шторке. */

export function formatAbv(abv: number): string {
  return `${String(abv).replace('.', ',')}%`
}

/**
 * «Красное сухое», «Белое брют», «Розовое игристое полусладкое».
 * Для брюта слово «игристое» лишнее: брют бывает только игристым.
 */
export function wineKind(wine: {
  category: string
  style: string | null
  sparkling: boolean
}): string {
  const style = wine.style?.toLowerCase() ?? null
  const brut = style === 'брют' || style === 'экстра брют'
  const parts = [wine.category, wine.sparkling && !brut ? 'игристое' : null, style]
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}

/** Цвет «плашки» категории — как у силуэта бутылки, чтобы строки различались без фото. */
export const CATEGORY_TINT: Readonly<Record<string, string>> = {
  Белое: '#dcc98e',
  Красное: '#8f3d42',
  Розовое: '#e0b8ba',
  Оранжевое: '#c98a3c',
}
