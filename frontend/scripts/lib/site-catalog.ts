import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { CsvRow } from './csv.ts'
import { PROJECT_ROOT } from './paths.ts'

export const SITE_CATALOG_PATH = resolve(PROJECT_ROOT, 'catalog/site-wines.json')
export const SITE_IMAGE_DIR = resolve(PROJECT_ROOT, 'catalog/site-images')

export interface SiteWine {
  slug: string
  title: string
  /** Дословная категория сайта, например «Красное сухое». */
  category: string
  color: string
  region: string
  manufacturer: string
  grapes: string[]
  description: string
  alcohol: number | null
  alcoholMax: number | null
  dishes: string[]
  servingTemperature: string | null
  publicRating: number | null
  pageUrl: string
  siteLastmod: string | null
  imageSha256: string
}

export interface SiteCatalogFile {
  sourceCatalogSha256: string
  sourceReviewedGallerySha256: string
  wines: SiteWine[]
}

const SHA256 = /^[0-9a-f]{64}$/
const SLUG = /^[a-z0-9][a-z0-9_-]{0,200}$/

export function siteImagePath(slug: string): string {
  if (!SLUG.test(slug)) throw new Error(`Некорректный site slug: ${slug}`)
  return resolve(SITE_IMAGE_DIR, `${slug}.webp`)
}

/** This committed projection is the build source; ignored work/ is never needed in production. */
export function loadSiteCatalog(): SiteCatalogFile {
  if (!existsSync(SITE_CATALOG_PATH)) {
    throw new Error(`Нет снимка site-only каталога: ${SITE_CATALOG_PATH}`)
  }
  const file = JSON.parse(readFileSync(SITE_CATALOG_PATH, 'utf8')) as SiteCatalogFile
  if (!SHA256.test(file.sourceCatalogSha256) || !SHA256.test(file.sourceReviewedGallerySha256)) {
    throw new Error('Нет SHA-256 исходного каталога или reviewed gallery')
  }
  if (!Array.isArray(file.wines)) throw new Error('Неверный формат site-only каталога')
  const seen = new Set<string>()
  for (const wine of file.wines) {
    if (!SLUG.test(wine.slug) || seen.has(wine.slug)) {
      throw new Error(`Некорректный или повторный site slug: ${wine.slug}`)
    }
    seen.add(wine.slug)
    for (const value of [wine.title, wine.category, wine.color, wine.region, wine.manufacturer]) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Неполная карточка сайта: ${wine.slug}`)
      }
    }
    if (!Array.isArray(wine.grapes) || !wine.grapes.every((grape) => typeof grape === 'string')) {
      throw new Error(`Неверные сорта винограда: ${wine.slug}`)
    }
    if (typeof wine.description !== 'string' || wine.pageUrl !== `https://vino-svoe.ru/wines/${wine.slug}`) {
      throw new Error(`Неверный источник карточки: ${wine.slug}`)
    }
    if (!SHA256.test(wine.imageSha256)) throw new Error(`Нет SHA-256 фотографии: ${wine.slug}`)
    if (
      wine.alcohol !== null &&
      (!Number.isFinite(wine.alcohol) || wine.alcohol < 0 || wine.alcohol > 1000)
    ) {
      throw new Error(`Некорректная крепость: ${wine.slug}`)
    }
    if (
      wine.alcoholMax !== null &&
      (wine.alcohol === null || !Number.isFinite(wine.alcoholMax) || wine.alcoholMax < wine.alcohol)
    ) {
      throw new Error(`Некорректный диапазон крепости: ${wine.slug}`)
    }
    const imagePath = siteImagePath(wine.slug)
    if (!existsSync(imagePath)) throw new Error(`Нет фотографии сайта: ${imagePath}`)
    const actualSha256 = createHash('sha256').update(readFileSync(imagePath)).digest('hex')
    if (actualSha256 !== wine.imageSha256) {
      throw new Error(`SHA-256 фотографии сайта изменился: ${wine.slug}`)
    }
  }
  return file
}

/** Only source fields are mapped; missing values remain empty instead of being invented. */
export function siteToCsvRow(wine: SiteWine): CsvRow {
  const colorCategory = /^(Белое|Красное|Розовое|Оранжевое)(?:\s|$)/.exec(wine.category)?.[1]
  if (!colorCategory) throw new Error(`Неизвестная категория сайта: ${wine.slug}: ${wine.category}`)
  return {
    'Название вина': wine.title,
    Категория: colorCategory,
    Цвет: wine.color,
    Регион: wine.region,
    'Сорт винограда': wine.grapes.join(', '),
    Описание: wine.description,
    Винодельня: wine.manufacturer,
    Slug: wine.slug,
    'Название фото': '',
  }
}
