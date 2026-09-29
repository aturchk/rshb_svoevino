import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ImagesManifest, WineDetailFile, WineIndexFile } from '../app/shared/config/dataset-schema.ts'
import { loadCatalog } from '../scripts/lib/csv.ts'
import { CSV_PATH, IMG_DIR, IMG_MANIFEST, WINES_DIR } from '../scripts/lib/paths.ts'
import { loadSiteCatalog, siteToCsvRow } from '../scripts/lib/site-catalog.ts'

const index = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../public/data/wines.index.json'), 'utf8'),
) as WineIndexFile
const manifest = JSON.parse(readFileSync(IMG_MANIFEST, 'utf8')) as ImagesManifest
const site = loadSiteCatalog().wines

describe('site-only reviewed SKU в каталоге Nuxt', () => {
  it('не перекрывают CSV и имеют полные карточки и локальные фото', () => {
    const csvSlugs = new Set(loadCatalog(CSV_PATH).rows.map((row) => row.Slug))
    expect(site).toHaveLength(75)
    expect(index.count).toBe(csvSlugs.size + site.length)
    for (const wine of site) {
      expect(csvSlugs.has(wine.slug)).toBe(false)
      expect(index.s.includes(wine.slug)).toBe(true)
      expect(manifest.items[wine.slug]).toBeDefined()
      expect(existsSync(resolve(IMG_DIR, 'thumb', `${wine.slug}.webp`))).toBe(true)
      expect(existsSync(resolve(IMG_DIR, 'detail', `${wine.slug}.webp`))).toBe(true)

      const detail = JSON.parse(
        readFileSync(resolve(WINES_DIR, `${wine.slug}.json`), 'utf8'),
      ) as WineDetailFile
      expect(detail.slug).toBe(wine.slug)
      expect(detail.name).toBe(wine.title)
      expect(detail.description).toBe(wine.description)
      expect(detail.colorRaw).toBe(wine.color)
      expect(detail.region).toBe(wine.region)
      expect(detail.winery).toBe(wine.manufacturer)
      expect(detail.grapes).toEqual(wine.grapes)
      expect(detail.category).toBe(siteToCsvRow(wine).Категория)
      expect(detail.image).not.toBeNull()
      // Raw `135` from two source cards and ABV ranges are not exact percentages.
      const exactAbv = wine.alcohol !== null && wine.alcohol <= 22 &&
        (wine.alcoholMax === null || wine.alcoholMax === wine.alcohol)
        ? wine.alcohol : null
      expect(detail.abv).toBe(exactAbv)
    }
  })
})
