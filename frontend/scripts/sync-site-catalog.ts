import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { loadCatalog } from './lib/csv.ts'
import { CSV_PATH, PROJECT_ROOT } from './lib/paths.ts'
import { SITE_CATALOG_PATH, siteImagePath, type SiteCatalogFile, type SiteWine } from './lib/site-catalog.ts'

/**
 * Explicit refresh from a locally verified site snapshot. Only site-only slugs
 * present in the reviewed model gallery enter the product catalog. The compact
 * projection and its hashed source images are committed, unlike work/.
 */
const REPO_ROOT = resolve(PROJECT_ROOT, '..')
const SNAPSHOT_DIR = resolve(REPO_ROOT, 'dataset/vino-svoe')
const CATALOG_SNAPSHOT = resolve(SNAPSHOT_DIR, 'catalog.jsonl')
const REVIEWED_GALLERY = resolve(SNAPSHOT_DIR, 'gallery-reviewed-candidates.jsonl')
const RAW_DIR = resolve(SNAPSHOT_DIR, 'images/raw')

interface SourceWine {
  slug: string
  page_url: string
  site_lastmod?: string | null
  site_wine: {
    title: string
    category: { name: string }
    color: string
    region: { name: string }
    manufacturer: { name: string }
    grapes: Array<{ name: string }>
    description: string
    alcohol?: number | null
    alcoholMax?: number | null
    dishes?: Array<{ name: string }>
    temperature?: string | null
    publicRating?: number | null
  }
  downloaded_images: Array<{ path: string; sha256: string }>
}

interface GalleryRow {
  slug: string
  source_image_path: string
  source_image_sha256: string
  view: string
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function readJsonl<T>(data: Buffer): T[] {
  return data.toString('utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as T)
}

const catalogBytes = readFileSync(CATALOG_SNAPSHOT)
const galleryBytes = readFileSync(REVIEWED_GALLERY)
const legacySlugs = new Set(loadCatalog(CSV_PATH).rows.map((row) => row.Slug))
const sourceBySlug = new Map(readJsonl<SourceWine>(catalogBytes).map((wine) => [wine.slug, wine]))
const reviewedSiteOnly = readJsonl<GalleryRow>(galleryBytes).filter((row) => !legacySlugs.has(row.slug))
const seen = new Set<string>()
const wines: SiteWine[] = []

for (const row of reviewedSiteOnly) {
  if (seen.has(row.slug)) throw new Error(`Повторный slug в gallery: ${row.slug}`)
  seen.add(row.slug)
  if (row.view !== 'site_normalized') throw new Error(`Не-site референс: ${row.slug}`)
  const source = sourceBySlug.get(row.slug)
  if (!source || source.site_wine.title === undefined) {
    throw new Error(`Нет карточки сайта для gallery slug: ${row.slug}`)
  }
  const sourceImage = resolve(REPO_ROOT, row.source_image_path)
  if (relative(RAW_DIR, sourceImage).startsWith('..')) {
    throw new Error(`Фото вне raw snapshot: ${row.slug}`)
  }
  const image = source.downloaded_images.find((item) => resolve(SNAPSHOT_DIR, item.path) === sourceImage)
  if (!image || image.sha256 !== row.source_image_sha256) {
    throw new Error(`Gallery/source связь фотографии не совпала: ${row.slug}`)
  }
  const imageBytes = readFileSync(sourceImage)
  if (sha256(imageBytes) !== image.sha256) throw new Error(`SHA-256 фотографии не совпал: ${row.slug}`)
  const destination = siteImagePath(row.slug)
  if (existsSync(destination) && sha256(readFileSync(destination)) !== image.sha256) {
    throw new Error(`Уже сохранённое фото отличается: ${destination}`)
  }
  mkdirSync(dirname(destination), { recursive: true })
  if (!existsSync(destination)) writeFileSync(destination, imageBytes)

  const wine = source.site_wine
  wines.push({
    slug: row.slug,
    title: wine.title,
    category: wine.category.name,
    color: wine.color,
    region: wine.region.name,
    manufacturer: wine.manufacturer.name,
    grapes: wine.grapes.map((grape) => grape.name),
    description: wine.description,
    alcohol: wine.alcohol ?? null,
    alcoholMax: wine.alcoholMax ?? null,
    dishes: (wine.dishes ?? []).map((dish) => dish.name),
    servingTemperature: wine.temperature ?? null,
    publicRating: wine.publicRating ?? null,
    pageUrl: source.page_url,
    siteLastmod: source.site_lastmod ?? null,
    imageSha256: image.sha256,
  })
}

wines.sort((a, b) => a.slug.localeCompare(b.slug))
const output: SiteCatalogFile = {
  sourceCatalogSha256: sha256(catalogBytes),
  sourceReviewedGallerySha256: sha256(galleryBytes),
  wines,
}
mkdirSync(dirname(SITE_CATALOG_PATH), { recursive: true })
writeFileSync(SITE_CATALOG_PATH, `${JSON.stringify(output, null, 2)}\n`)
console.log(`Site-only из reviewed gallery: ${wines.length}. Источник: ${SITE_CATALOG_PATH}`)
