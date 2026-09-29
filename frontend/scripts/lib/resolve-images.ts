import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

import { UPLOAD_DIRS } from './paths.ts'

/**
 * Сопоставление «Название фото» из CSV с файлами в uploads.
 *
 * Strapi переименовывает загруженные файлы: транслитерация, «_» вместо любых
 * разделителей и суффикс из десяти hex-символов. Поэтому сравниваем не имена,
 * а их канонические формы, и делаем это по заранее построенной карте — никакого
 * existsSync по угаданному имени (сломается на регистрозависимой ФС).
 */

/** Только то, что sharp умеет читать. На диске лежат ещё .geojson, .xml, .svg, .heic. */
const ALLOWED_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png'])

const STRAPI_HASH = /(_[0-9a-f]{10})+$/
const NON_ALNUM = /[^0-9a-zа-яё]+/gi

function canonical(fileName: string): string {
  const withoutExt = fileName.slice(0, fileName.length - extname(fileName).length)
  return withoutExt.replace(STRAPI_HASH, '').replace(NON_ALNUM, '').toLowerCase()
}

export interface UploadsIndex {
  /** каноническое имя → абсолютный путь */
  byName: Map<string, string>
  scanned: number
  skippedByExtension: number
}

export function buildUploadsIndex(): UploadsIndex {
  const byName = new Map<string, string>()
  let scanned = 0
  let skippedByExtension = 0

  for (const dir of UPLOAD_DIRS) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue // каталог может отсутствовать — это не повод валить сборку
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      scanned += 1
      if (!ALLOWED_EXT.has(extname(entry).toLowerCase())) {
        skippedByExtension += 1
        continue
      }
      const key = canonical(entry)
      if (key && !byName.has(key)) byName.set(key, join(dir, entry))
    }
  }

  return { byName, scanned, skippedByExtension }
}

/**
 * Резолв в два канала: сначала по имени фото, затем по slug — часть файлов
 * названа по слагу позиции. Покрытие на выданном пакете: около 47%,
 * остальных файлов в нём физически нет.
 */
export function resolveImage(
  index: UploadsIndex,
  photoName: string,
  slug: string,
): string | null {
  return index.byName.get(canonical(photoName)) ?? index.byName.get(canonical(slug)) ?? null
}

export { canonical as canonicalFileName }
