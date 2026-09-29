import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildWineIndex } from '@/entities/wine/lib/build-index'
import type { WineIndex } from '@/entities/wine/model/types'
import type { WineDetailFile, WineDict, WineIndexFile } from '@/shared/config/dataset-schema'
import { DICT_FILE, INDEX_FILE, wineFile } from '@/shared/config/dataset-schema'

/**
 * Серверный каталог из версионированных JSON в public/data.
 * Потребители работают с WineIndex и не зависят от формата хранения.
 *
 * Индекс строится один раз на процесс: 2178 позиций, затем читается из памяти.
 */
export interface Catalog {
  index: WineIndex
  idBySlug: Map<string, number>
}

let catalog: Promise<Catalog> | null = null

/**
 * Чтение сгенерированного файла из public/. В продакшене статику отдаёт сам Nitro,
 * и внутренний $fetch проходит без сети. В dev public/ раздаёт внешний dev-сервер,
 * до которого внутренний $fetch не достаёт, — поэтому читаем с диска (cwd = корень Nuxt).
 */
async function readData<T>(path: string): Promise<T> {
  if (import.meta.dev) {
    return JSON.parse(await readFile(join(process.cwd(), 'public', path), 'utf8')) as T
  }
  const data: unknown = await $fetch(`/${path}`)
  return data as T
}

export function useCatalog(): Promise<Catalog> {
  catalog ??= Promise.all([readData<WineDict>(DICT_FILE), readData<WineIndexFile>(INDEX_FILE)])
    .then(([dict, file]) => {
      const index = buildWineIndex(dict, file)
      return { index, idBySlug: new Map(index.slugs.map((slug, id) => [slug, id])) }
    })
    .catch((cause: unknown) => {
      // Не кэшируем провал: следующий запрос попробует снова.
      catalog = null
      throw cause
    })
  return catalog
}

/**
 * slug приходит из URL: латиница, цифры, дефис и подчёркивание (у 36 позиций каталога
 * оно есть: perovskih_aligote) — никаких «../». Точный пропуск всё равно даёт idBySlug.
 */
const SLUG = /^[a-z0-9][a-z0-9_-]{0,200}$/

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug)
}

export async function loadWineDetail(slug: string): Promise<WineDetailFile | null> {
  if (!isValidSlug(slug)) return null
  const { idBySlug } = await useCatalog()
  if (!idBySlug.has(slug)) return null
  return readData<WineDetailFile>(wineFile(slug))
}
