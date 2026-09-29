import { readFileSync } from 'node:fs'

import Papa from 'papaparse'

/**
 * Колонки ровно те, что в выгрузке Strapi. Если заказчик пришлёт другой дамп,
 * упадёт здесь с понятным текстом, а не молча отдаст пустой каталог.
 */
export const CSV_COLUMNS = [
  'Название вина',
  'Категория',
  'Цвет',
  'Регион',
  'Сорт винограда',
  'Описание',
  'Винодельня',
  'Slug',
  'Название фото',
] as const

export type CsvColumn = (typeof CSV_COLUMNS)[number]
export type CsvRow = Record<CsvColumn, string>

/** Инварианты замерены на выданном дампе от 07.09; расхождение — повод остановиться. */
export const EXPECTED_ROWS = 4147
export const EXPECTED_UNIQUE_SLUGS = 2103

export interface LoadResult {
  rows: CsvRow[]
  totalRows: number
  duplicatesDropped: number
}

/**
 * Парсим RFC4180-парсером, а не split('\n'): в файле 6326 физических строк
 * на 4147 записей — около 2179 переводов строки находятся внутри закавыченных
 * «Описаний», плюс запятые внутри кавычек в «Сорт винограда».
 */
export function loadCatalog(csvPath: string, options?: { strict?: boolean }): LoadResult {
  const strict = options?.strict ?? true
  const text = readFileSync(csvPath, 'utf8')
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
  })

  const fields = parsed.meta.fields ?? []
  const missing = CSV_COLUMNS.filter((column) => !fields.includes(column))
  if (missing.length > 0) {
    throw new Error(`В CSV нет обязательных колонок: ${missing.join(', ')}`)
  }

  const raw = parsed.data
  if (strict && raw.length !== EXPECTED_ROWS) {
    throw new Error(
      `Ожидалось ${EXPECTED_ROWS} строк, получено ${raw.length}. ` +
        'Дамп изменился — проверьте инварианты, прежде чем собирать.',
    )
  }

  // Дедуп по slug: 49% строк дампа — точные дубликаты всех девяти колонок.
  const bySlug = new Map<string, CsvRow>()
  for (const item of raw) {
    const row = Object.fromEntries(
      CSV_COLUMNS.map((column) => [column, (item[column] ?? '').trim()]),
    ) as CsvRow
    if (!row.Slug) continue
    if (!bySlug.has(row.Slug)) bySlug.set(row.Slug, row)
  }

  const rows = [...bySlug.values()]
  if (strict && rows.length !== EXPECTED_UNIQUE_SLUGS) {
    throw new Error(
      `Ожидалось ${EXPECTED_UNIQUE_SLUGS} уникальных slug, получено ${rows.length}.`,
    )
  }

  return { rows, totalRows: raw.length, duplicatesDropped: raw.length - rows.length }
}
