/**
 * Гастрономические рекомендации самой винодельни из поля «Описание».
 *
 * Примерно у 9% позиций в описании есть фраза вроде «К красному мясу, выдержанным
 * сырам» или «Идеальный аперитив». Это факт каталога, а не вывод правил, поэтому
 * в карточке он показывается дословно и отдельно от рекомендаций сомелье.
 *
 * Отбор консервативный: предложение берётся, только если в нём есть глагол подачи
 * («к», «подходит к», «сочетается с», «сочетания:») и в пределах пары слов после
 * него — блюдо. Ароматы («сочетание ароматов», «фруктовые ноты», «выпечка» в букете)
 * не проходят: в списке блюд нет слов, которыми описывают букет.
 */

const CYR = '[а-яё]*'
const END = '(?=[^а-яё]|$)'

/**
 * Фрукты, ягоды и орехи — одновременно блюдо («к свежим фруктам») и описание букета
 * («аромат гармонично сочетается с тропическими фруктами»). Их считаем блюдом
 * только после «к»: «сочетается с фруктами» без другого блюда рядом — это букет.
 */
const WEAK_DISH = /(?:^|[^а-яё])(?:фрукт(?:ам|ами)|ягод(?:ам|ами)|орех(?:ам|ами))/

const DISH = new RegExp(
  '(?:^|[^а-яё])(?:' +
    [
      'мяс',
      'стейк',
      'говяд',
      'говяж',
      'баран',
      'ягн',
      'телят',
      'свин',
      'шашлык',
      'барбекю',
      'птиц',
      'куриц',
      'курин',
      'утк',
      'утин',
      'индейк',
      'кролик',
      'дич',
      'рыб',
      'лосос',
      'форел',
      'суши',
      'сашими',
      'ролл',
      'морепродукт',
      'устриц',
      'мидии',
      'мидиям',
      'креветк',
      'гребеш',
      'сыр',
      'камамбер',
      'пармезан',
      'десерт',
      'закуск',
      'салат',
      'овощ',
      'паштет',
      'паст',
      'ризотто',
      'пицц',
      'гриб',
      'жюльен',
      'блюд',
      'севиче',
      'тартар',
      'тар-тар',
      'равиол',
      'икр',
      'плов',
      'хинкал',
      'чебурек',
      'кухн',
      'оливк',
      'колбас',
      'хамон',
      'брынз',
      'сулугуни',
      'морожен',
      'пирож',
      // Только дательный падеж: «сладостью» — это уже описание вкуса.
      'сладостям',
    ].join('|') +
    ')',
)

/** Метки, после которых идёт перечень блюд. Предложение режется от метки. */
const LABEL = new RegExp(`(?:гастрономическ${CYR}\\s+)?сочетани${CYR}\\s*:|гастрономи${CYR}\\s*:`)

/** «к» и «с» — вместе с «ко» и «со»: «сочетается со свежими ягодами». */
const TO = `(?:к|ко)${END}`
const WITH = `(?:с|со)${END}`

const LEADS = new RegExp(
  [
    `рекоменду${CYR}\\s+(?:подавать\\s+)?(?:${TO}|${WITH})`,
    `подава${CYR}\\s+(?:${TO}|${WITH})`,
    `подают\\s+(?:${TO}|${WITH})`,
    `подойд[её]т\\s+(?:${TO}|для)`,
    `подходит\\s+(?:${TO}|для)`,
    `(?:^|[^а-яё])хорош${CYR}\\s+(?:${TO}|${WITH}|для)`,
    `сочета${CYR}(?:\\s+[а-яё]+)?\\s+${WITH}`,
    `в\\s+пар[уе]\\s+${WITH}`,
    `идеал${CYR}\\s+(?:${TO}|для|${WITH})`,
    `(?:^|[.;:—]\\s*)${TO}`,
    `(?:компаньон|спутник|дополнени${CYR})\\s+(?:${TO}|для)`,
  ].join('|'),
  'g',
)
/** Лид «к …» — единственный, после которого фрукты и орехи точно блюдо. */
const TO_LEAD = new RegExp(`(?:^|[^а-яё])(?:к|ко)${END}\\s*$`)

const APERITIF = /аперитив/
/** Сколько символов после глагола ищем блюдо: «к ... мясным блюдам» — пара слов. */
const LOOKAHEAD = 70
const MAX_LENGTH = 240

function isPairingSentence(sentence: string): boolean {
  const lower = sentence.toLowerCase()
  if (APERITIF.test(lower) || LABEL.test(lower)) return true
  LEADS.lastIndex = 0
  for (let match = LEADS.exec(lower); match; match = LEADS.exec(lower)) {
    const start = match.index + match[0].length
    const tail = lower.slice(start, start + LOOKAHEAD)
    if (DISH.test(tail)) return true
    if (WEAK_DISH.test(tail) && TO_LEAD.test(match[0])) return true
  }
  return false
}

function truncate(text: string): string {
  if (text.length <= MAX_LENGTH) return text
  const cut = text.slice(0, MAX_LENGTH)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export function extractPairingNote(description: string): string | null {
  const text = description.replace(/\s+/g, ' ').trim()
  const picked: string[] = []
  for (const raw of text.split(/(?<=[.!?…])\s+/)) {
    const sentence = raw.trim()
    if (!sentence || !isPairingSentence(sentence)) continue
    // «…кислинкой Сочетания: утка, сыры» — в исходнике нет точки перед меткой.
    const label = LABEL.exec(sentence.toLowerCase())
    picked.push(label && label.index > 0 ? sentence.slice(label.index) : sentence)
  }
  if (picked.length === 0) return null
  const note = picked.join(' ')
  return truncate(note.charAt(0).toUpperCase() + note.slice(1))
}
