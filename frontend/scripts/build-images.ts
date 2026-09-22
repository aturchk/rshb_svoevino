import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'

import type { ImagesManifest } from '../src/shared/config/dataset-schema.ts'

import { loadCatalog } from './lib/csv.ts'
import { assertDataset, CSV_PATH, IMG_DIR, IMG_MANIFEST } from './lib/paths.ts'
import { buildUploadsIndex, resolveImage } from './lib/resolve-images.ts'

/**
 * Генерация двух размеров бутылок.
 *
 * Запускается отдельной командой, а НЕ в prebuild: полный прогон около 107 секунд,
 * держать это на каждой сборке нельзя. Результат кэшируется по содержимому
 * исходника, поэтому повторный запуск занимает меньше секунды.
 */

const THUMB_BOX = 96 // список: CSS-размер 48px, x2 для плотных экранов
const DETAIL_BOX = { width: 320, height: 1140 } // карточка
const CACHE_FILE = resolve(IMG_DIR, '.cache.json')

interface CacheEntry {
  key: string
  width: number
  height: number
}

const force = process.argv.includes('--force')

function readCache(): Record<string, CacheEntry> {
  if (force || !existsSync(CACHE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, CacheEntry>
  } catch {
    return {}
  }
}

/** Ключ кэша по метаданным исходника и параметрам ресайза — без чтения самого файла. */
function cacheKey(sourcePath: string): string {
  const stat = statSync(sourcePath)
  return createHash('sha1')
    .update(`${sourcePath}|${stat.mtimeMs}|${stat.size}|${THUMB_BOX}|${DETAIL_BOX.width}`)
    .digest('hex')
}

/** Простой семафор: sharp и так многопоточный, перегружать его очередью смысла нет. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++
      const item = items[index]
      if (item === undefined) return
      results[index] = await worker(item)
    }
  })
  await Promise.all(runners)
  return results
}

async function main(): Promise<void> {
  assertDataset()
  const started = Date.now()
  const { rows } = loadCatalog(CSV_PATH)
  const uploads = buildUploadsIndex()

  const jobs = rows
    .map((row) => ({
      slug: row.Slug,
      source: resolveImage(uploads, row['Название фото'], row.Slug),
    }))
    .filter((job): job is { slug: string; source: string } => job.source !== null)

  console.log(
    `Каталог: ${rows.length} позиций. Файлов в uploads: ${uploads.scanned} ` +
      `(отброшено по расширению: ${uploads.skippedByExtension}). ` +
      `Резолвится фотографий: ${jobs.length} (${((100 * jobs.length) / rows.length).toFixed(1)}%).`,
  )

  mkdirSync(join(IMG_DIR, 'thumb'), { recursive: true })
  mkdirSync(join(IMG_DIR, 'detail'), { recursive: true })

  const cache = readCache()
  const pending = jobs.filter((job) => {
    const entry = cache[job.slug]
    if (!entry) return true
    if (entry.key !== cacheKey(job.source)) return true
    return (
      !existsSync(join(IMG_DIR, 'thumb', `${job.slug}.webp`)) ||
      !existsSync(join(IMG_DIR, 'detail', `${job.slug}.webp`))
    )
  })
  console.log(`К перегенерации: ${pending.length}, из кэша: ${jobs.length - pending.length}.`)

  const failures: Array<{ slug: string; reason: string }> = []

  if (pending.length > 0) {
    // sharp импортируется только когда реально нужен: если всё в кэше,
    // отсутствие нативных бинарников вообще не помешает собрать проект.
    const { default: sharp } = await import('sharp')

    await mapWithLimit(pending, availableParallelism(), async (job) => {
      try {
        // limitInputPixels: в пакете есть файл 8064x8347 — это ~195 МБ RGBA на декод.
        const input = () => sharp(job.source, { limitInputPixels: 80_000_000 }).rotate()

        const thumb = await input()
          .resize({ width: THUMB_BOX, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer({ resolveWithObject: true })

        await input()
          .resize({ ...DETAIL_BOX, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(join(IMG_DIR, 'detail', `${job.slug}.webp`))

        writeFileSync(join(IMG_DIR, 'thumb', `${job.slug}.webp`), thumb.data)

        cache[job.slug] = {
          key: cacheKey(job.source),
          width: thumb.info.width,
          height: thumb.info.height,
        }
      } catch (error) {
        // Один битый файл не должен валить сборку всего каталога.
        failures.push({ slug: job.slug, reason: error instanceof Error ? error.message : 'unknown' })
      }
    })
  }

  const manifest: ImagesManifest = {
    generatedAt: new Date().toISOString(),
    items: Object.fromEntries(
      jobs
        .map((job) => [job.slug, cache[job.slug]] as const)
        .filter((pair): pair is readonly [string, CacheEntry] => pair[1] !== undefined)
        .map(([slug, entry]) => [slug, { width: entry.width, height: entry.height }]),
    ),
  }

  writeFileSync(CACHE_FILE, JSON.stringify(cache))
  writeFileSync(IMG_MANIFEST, JSON.stringify(manifest))

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Готово за ${seconds} с. В манифесте: ${Object.keys(manifest.items).length}.`)
  if (failures.length > 0) {
    console.warn(`Не удалось обработать ${failures.length} файлов:`)
    for (const failure of failures.slice(0, 10)) {
      console.warn(`  ${failure.slug}: ${failure.reason}`)
    }
  }
}

await main()
