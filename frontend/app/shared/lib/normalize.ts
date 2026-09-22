/**
 * Нормализация строки для подстрочного поиска.
 * Одна реализация на приложение и на скрипт сборки — иначе поисковый индекс
 * и поисковый запрос разойдутся, и поиск начнёт молча не находить.
 */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/g, ' ')
    .trim()
}
