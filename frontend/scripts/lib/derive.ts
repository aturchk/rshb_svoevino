/**
 * Деривация полей, которых нет отдельными колонками в CSV.
 * Всё считается на этапе сборки: в рантайме приложение получает готовые значения.
 * Покрытие замерено на реальных 2103 позициях и зафиксировано в тестах.
 *
 * Про регулярки: `\w` и `\b` в JS видят только латиницу, поэтому для кириллицы
 * классы и границы слова пишутся явно — иначе «игристое вино» молча не находится.
 */

const CYR = '[а-яё]*'
/** Граница слова, которая работает и для кириллицы. */
const EDGE_START = '(?:^|[^а-яёa-z0-9])'
const EDGE_END = '(?=[^а-яёa-z0-9]|$)'

/** Стиль по сахару. Порядок проверок важен: «полусухое» содержит «сухое». */
const STYLE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Экстра брют', /экстра[\s-]?брют|ekstra[\s_-]?bryut|extra[\s_-]?brut/],
  ['Полусухое', /полусухое|polusuhoe|semi[\s_-]?dry/],
  ['Полусладкое', /полусладкое|polusladkoe|semi[\s_-]?sweet|semisweet/],
  ['Брют', /брют|bryut|\bbrut\b/],
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

/**
 * Игристость по названию, slug и имени фото. Кроме русских слов — латинские маркеры,
 * которыми винодельни пишут этикетки: Brut, Blanc de Blancs, Frizzante, Pet-Nat.
 * «Blanc de Neige» и «Sauvignon Blanc de Gaï-Kodzor» — тихие вина, поэтому после
 * «blanc de» принимается только blancs.
 */
const SPARKLING_NAME =
  /игрист|igrist|брют|bryut|\bbrut\b|экстрабрют|ekstrabryut|шампан|shampan|spumante|cremant|креман|frizzante|фриззанте|pet[\s_-]?nat|пет[\s_-]?нат|петнат|blanc?[\s_-]de[\s_-](?:blancs?|blan)(?![a-z])|блан[\s-]де[\s-]блан/

/**
 * «Blanc de Noirs» бывает и тихим: белое из красного винограда («Каберне совиньон
 * Блан де Нуар» — сухое 13%). Поэтому оно считается игристым только вместе со вторым
 * признаком — брютом в названии или игристостью в описании.
 */
const BLANC_DE_NOIRS = /blanc?[\s_-]de[\s_-](?:noirs?|nuar)|блан[\s-]де[\s-]нуар/
const DRY_SPARKLING_STYLE = /брют|bryut|\bbrut\b/

/**
 * Игристость по описанию — только устойчивые технологические признаки: перляж,
 * мусс, метод Шарма, шампанизация. «Лёгкая игристость» тихого вина сюда не попадает.
 */
const SPARKLING_DESCRIPTION = new RegExp(
  [
    `игрист${CYR}\\s+(?:${CYR}\\s+)?вин`,
    `шампанск${CYR}\\s+вин`,
    `${EDGE_START}шампанское${EDGE_END}`,
    'перляж',
    `${EDGE_START}мусс${EDGE_END}`,
    `игрист${CYR}\\s+(?:экстра\\s+)?брют`,
    `метод${CYR}\\s+шарма`,
    `(?:классическ|традиционн)${CYR}\\s+метод`,
    'шампанизац',
    'ремюаж',
    `закладк${CYR}\\s+на\\s+вторичн`,
    `вторичн${CYR}\\s+брожени${CYR}\\s+в\\s+бутылк`,
    `пет[\\s-]?нат`,
    'пузырьк',
    'пузырик',
  ].join('|'),
)

export function deriveSparkling(
  name: string,
  slug: string,
  description = '',
  photoName = '',
): boolean {
  const label = `${name} ${slug} ${photoName}`.toLowerCase()
  if (SPARKLING_NAME.test(label)) return true
  const fromDescription = SPARKLING_DESCRIPTION.test(description.toLowerCase())
  if (BLANC_DE_NOIRS.test(label)) return fromDescription || DRY_SPARKLING_STYLE.test(label)
  return fromDescription
}

/**
 * Крепость. Закодирована хвостом slug и имени фото: «...-krasnoe-suhoe-135» → 13.5%.
 * Трёхзначное читается как десятые, двузначное как целое. Диапазон 4.5–22 отсекает
 * порядковые номера.
 *
 * Хвост принимается, только если рядом есть маркер вина (цвет или сахар). Без этого
 * правила «daniel-22» давал 22% (это год 2022), а «Screenshot_19.webp» — 19%:
 * на выданном дампе так появлялось 11 ложных значений.
 */
const ABV_MIN = 4.5
const ABV_MAX = 22

const WINE_MARKER =
  /(?:^|[-_ ])(?:beloe|krasnoe|rozovoe|oranzhevoe|suhoe|polusuhoe|polusladkoe|sladkoe|bryut|brut|igristoe|desertnoe|likernoe|kreplyonoe|kreplenoe)(?:[-_ .]|$)/i

function parseAbvTail(tail: string): number | null {
  const digits = Number(tail)
  if (!Number.isFinite(digits)) return null
  const value = tail.length === 3 ? digits / 10 : digits
  return value >= ABV_MIN && value <= ABV_MAX ? value : null
}

const ABV_FROM_SLUG = /[-_](\d{2,3})$/
/** «…-krasnoe-suhoe-13-15» — это диапазон 13–15%, а не 15%: точное значение не выдумываем. */
const ABV_RANGE = /[-_](\d{2,3})[-_](\d{2,3})$/
const ABV_FROM_PHOTO = /[-_](\d{2,3})(?:_[0-9a-f]{10})?$/
const PHOTO_EXT = /\.(webp|jpe?g|png|heic|tiff?|jfif)$/i

export function deriveAbv(slug: string, photoName: string): number | null {
  const range = ABV_RANGE.exec(slug)
  if (range?.[1] && range[2] && WINE_MARKER.test(slug)) {
    const low = parseAbvTail(range[1])
    const high = parseAbvTail(range[2])
    if (low !== null && high !== null && low < high) return null
  }
  const fromSlug = ABV_FROM_SLUG.exec(slug)
  if (fromSlug?.[1] && WINE_MARKER.test(slug)) {
    const value = parseAbvTail(fromSlug[1])
    if (value !== null) return value
  }
  const photo = photoName.replace(PHOTO_EXT, '')
  const fromPhoto = ABV_FROM_PHOTO.exec(photo)
  if (fromPhoto?.[1] && WINE_MARKER.test(photo)) return parseAbvTail(fromPhoto[1])
  return null
}

/**
 * Креплёные и ликёрные вина: портвейн, мадера, херес, кагор, «солера», а также
 * сладкие от 15% — это десертные вина, где крепость дал спирт, а не тело.
 * Сухие красные на 15–16% (аппассименто, резервы) креплёными не считаются.
 */
const FORTIFIED = new RegExp(
  [
    'портвейн',
    'portve[yj]n',
    `${EDGE_START}(?:порто|porto)${EDGE_END}`,
    'мадер',
    'madera',
    'херес',
    'heres',
    'кагор',
    'kagor',
    'крепл[её]н',
    'krepl[yj]?[oe]n',
    'ликёрн',
    'ликерн',
    'likern',
    'solera',
    'солера',
  ].join('|'),
)

export function deriveFortified(
  name: string,
  slug: string,
  style: string | null,
  abv: number | null,
): boolean {
  if (FORTIFIED.test(`${name} ${slug}`.toLowerCase())) return true
  return style === 'Сладкое' && abv !== null && abv >= 15
}

/**
 * Выдержка в дубе — по описанию. Нужна правилам сомелье: плотное белое из барриков
 * тянется к сливочным соусам, а не к устрицам.
 *  - считается только дуб: «бочки из акации» дубом не являются, поэтому голая «бочка»
 *    не в счёт;
 *  - «Дубровский» не в счёт: слово «дуб» ищется целиком, с окончаниями;
 *  - отрицание проверяется по фразе целиком: «без выдержки в дубовой бочке»,
 *    «не выдерживалось в дубе» — не дуб.
 */
const OAK = new RegExp(
  `${EDGE_START}(?:дуб(?:[аеу]|ом|ов${CYR})?|баррик${CYR}|барик${CYR})${EDGE_END}|oak|barri?que`,
)
const OAK_NEGATION = new RegExp(
  `${EDGE_START}(?:без|не)\\s+(?:[а-яё]+\\s+){0,3}(?:дуб|баррик|барик|бочк)`,
)

export function deriveOak(name: string, description: string): boolean {
  const clauses = `${name}. ${description}`.toLowerCase().split(/[.;!?\n]+/)
  return clauses.some((clause) => OAK.test(clause) && !OAK_NEGATION.test(clause))
}

/**
 * Сахар не написан в названии, но описание прямо говорит, что вино сладкое или
 * десертное: «десертное», «поздний сбор», «сладкое … вино», айсвайн. Правилам
 * сомелье этого хватает, чтобы не советовать такое вино к устрицам. В карточке
 * поле «Сахар» при этом остаётся «не указан»: это подсказка, а не данные каталога.
 */
const SWEET_NAME = /десерт|dessert|поздн[а-яё]*\s+сбор|late\s+harvest|ice\s*wine|айс\s*вайн|ледян/
const SWEET_DESCRIPTION = new RegExp(
  [
    `десертн${CYR}\\s+(?:вин|нот|характер|стил|сладост)`,
    // «вино позднего сбора», но не «поздний сбор урожая» — так пишут и про сухие
    `вин${CYR}\\s+поздн${CYR}\\s+сбор`,
    // «сладкое розовое вино», но не «полусладкое вино»
    `${EDGE_START}сладк${CYR}\\s+(?:[а-яё]+\\s+){0,2}вин`,
    `ледян${CYR}\\s+вин`,
  ].join('|'),
)

export function deriveSweetHint(
  name: string,
  description: string,
  style: string | null,
): boolean {
  if (style !== null) return false
  return SWEET_NAME.test(name.toLowerCase()) || SWEET_DESCRIPTION.test(description.toLowerCase())
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
