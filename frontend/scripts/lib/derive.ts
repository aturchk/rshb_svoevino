/**
 * Деривация полей, которых нет отдельными колонками в CSV.
 * Всё считается на этапе сборки: в рантайме приложение получает готовые значения.
 * Покрытие замерено на реальных 2103 позициях и зафиксировано в тестах.
 */

/** Стиль по сахару. Порядок проверок важен: «полусухое» содержит «сухое». */
const STYLE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Экстра брют', /экстра[\s-]?брют|ekstra[\s_-]?bryut/],
  ['Полусухое', /полусухое|polusuhoe/],
  ['Полусладкое', /полусладкое|polusladkoe/],
  ['Брют', /брют|bryut/],
  ['Сухое', /сухое|suhoe/],
  ['Сладкое', /сладкое|sladkoe/],
]

export const STYLES: readonly string[] = STYLE_PATTERNS.map(([label]) => label)

export function deriveStyle(name: string, slug: string): string | null {
  const haystack = `${name} ${slug}`.toLowerCase()
  for (const [label, pattern] of STYLE_PATTERNS) {
    if (pattern.test(haystack)) return label
  }
  return null
}

const SPARKLING = /игрист|igrist|брют|bryut|шампан|shampan|spumante|cremant|креман/

export function deriveSparkling(name: string, slug: string): boolean {
  return SPARKLING.test(`${name} ${slug}`.toLowerCase())
}

/**
 * Крепость. Закодирована хвостом slug и имени фото: «...-krasnoe-suhoe-135» → 13.5%.
 * Трёхзначное читается как десятые, двузначное как целое. Диапазон 4.5–22 отсекает
 * порядковые номера и годы, случайно оказавшиеся в хвосте.
 */
const ABV_MIN = 4.5
const ABV_MAX = 22

function parseAbvTail(tail: string): number | null {
  const digits = Number(tail)
  if (!Number.isFinite(digits)) return null
  const value = tail.length === 3 ? digits / 10 : digits
  return value >= ABV_MIN && value <= ABV_MAX ? value : null
}

const ABV_FROM_SLUG = /[-_](\d{2,3})$/
const ABV_FROM_PHOTO = /[-_](\d{2,3})(?:_[0-9a-f]{10})?$/
const PHOTO_EXT = /\.(webp|jpe?g|png|heic|tiff?|jfif)$/i

export function deriveAbv(slug: string, photoName: string): number | null {
  const fromSlug = ABV_FROM_SLUG.exec(slug)
  if (fromSlug?.[1]) {
    const value = parseAbvTail(fromSlug[1])
    if (value !== null) return value
  }
  const fromPhoto = ABV_FROM_PHOTO.exec(photoName.replace(PHOTO_EXT, ''))
  if (fromPhoto?.[1]) return parseAbvTail(fromPhoto[1])
  return null
}

/**
 * Цвет в CSV — свободный текст: 826 уникальных значений на 2103 позиции.
 * Как фильтр он непригоден, но в карточке полезен, поэтому сводим к семейству
 * и показываем рядом с исходной формулировкой винодельни.
 */
const COLOR_FAMILIES: ReadonlyArray<readonly [string, string]> = [
  ['рубин', 'Рубиновый'],
  ['гранат', 'Гранатовый'],
  ['вишн', 'Вишнёвый'],
  ['пурпур', 'Пурпурный'],
  ['малин', 'Малиновый'],
  ['солом', 'Соломенный'],
  ['золот', 'Золотистый'],
  ['янтар', 'Янтарный'],
  ['лимон', 'Лимонный'],
  ['лосос', 'Лососевый'],
  ['персик', 'Персиковый'],
  ['розов', 'Розовый'],
  ['оранж', 'Оранжевый'],
  ['медн', 'Медный'],
  ['красн', 'Красный'],
  ['бел', 'Белый'],
]

export function deriveColorFamily(color: string): string {
  const value = color.toLowerCase()
  for (const [needle, family] of COLOR_FAMILIES) {
    if (value.includes(needle)) return family
  }
  return 'Прочее'
}

/** Сорта в CSV — мультизначное поле через запятую; 16.4% позиций это купажи. */
export function splitGrapes(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
