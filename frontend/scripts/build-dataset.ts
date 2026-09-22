import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  FacetValue,
  ImagesManifest,
  WineDetailFile,
  WineDict,
  WineFacetsFile,
  WineIndexFile,
} from '../app/shared/config/dataset-schema.ts'
import { IMG_DETAIL, IMG_THUMB } from '../app/shared/config/dataset-schema.ts'
import { normalizeSearchText } from '../app/shared/lib/normalize.ts'

import { loadCatalog } from './lib/csv.ts'
import {
  deriveAbv,
  deriveColorFamily,
  deriveSparkling,
  deriveStyle,
  splitGrapes,
  STYLES,
} from './lib/derive.ts'
import { assertDataset, CSV_PATH, DATA_DIR, IMG_MANIFEST, WINES_DIR } from './lib/paths.ts'

/**
 * CSV → готовые JSON. Запускается в prebuild, потому что в браузере датасет
 * не парсится никогда: 2.95 МБ CSV с многострочными описаниями превратились бы
 * в секунды блокировки главного потока.
 */

/** Справочник со стабильными индексами: индекс уходит в URL, поэтому порядок фиксируем. */
function buildLookup(values: Iterable<string>): { list: string[]; indexOf: Map<string, number> } {
  const list = [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru'))
  const indexOf = new Map(list.map((value, index) => [value, index]))
  return { list, indexOf }
}

function countBy(values: number[], size: number): FacetValue[] {
  const counts = new Array<number>(size).fill(0)
  for (const value of values) {
    if (value >= 0) counts[value] = (counts[value] ?? 0) + 1
  }
  return counts.map((count, value) => ({ value, count }))
}

function main(): void {
  assertDataset()
  const started = Date.now()
  const { rows, totalRows, duplicatesDropped } = loadCatalog(CSV_PATH)

  const manifest: ImagesManifest['items'] = existsSync(IMG_MANIFEST)
    ? (JSON.parse(readFileSync(IMG_MANIFEST, 'utf8')) as ImagesManifest).items
    : {}
  if (Object.keys(manifest).length === 0) {
    console.warn('Манифест изображений пуст — соберите их командой npm run build:images.')
  }

  const categories = buildLookup(rows.map((row) => row.Категория))
  const regions = buildLookup(rows.map((row) => row.Регион))
  const wineries = buildLookup(rows.map((row) => row.Винодельня))
  const grapes = buildLookup(rows.flatMap((row) => splitGrapes(row['Сорт винограда'])))

  const dict: WineDict = {
    categories: categories.list,
    regions: regions.list,
    grapes: grapes.list,
    wineries: wineries.list,
    wineriesNorm: wineries.list.map(normalizeSearchText),
    styles: [...STYLES],
  }

  const index: WineIndexFile = {
    count: rows.length,
    s: [],
    n: [],
    c: [],
    r: [],
    w: [],
    st: [],
    sp: [],
    abv: [],
    g: [],
    img: [],
    iw: [],
    ih: [],
  }

  rmSync(WINES_DIR, { recursive: true, force: true })
  mkdirSync(WINES_DIR, { recursive: true })

  let withAbv = 0
  let withStyle = 0
  let withPhoto = 0
  let sparklingCount = 0

  for (const row of rows) {
    const slug = row.Slug
    const name = row['Название вина']
    const style = deriveStyle(name, slug)
    const sparkling = deriveSparkling(name, slug)
    const abv = deriveAbv(slug, row['Название фото'])
    const grapeNames = splitGrapes(row['Сорт винограда'])
    const photo = manifest[slug]

    index.s.push(slug)
    index.n.push(name)
    index.c.push(categories.indexOf.get(row.Категория) ?? 0)
    index.r.push(regions.indexOf.get(row.Регион) ?? 0)
    index.w.push(wineries.indexOf.get(row.Винодельня) ?? 0)
    index.st.push(style === null ? -1 : dict.styles.indexOf(style))
    index.sp.push(sparkling ? 1 : 0)
    index.abv.push(abv)
    index.g.push(grapeNames.map((grape) => grapes.indexOf.get(grape) ?? 0))
    index.img.push(photo ? 1 : 0)
    index.iw.push(photo?.width ?? 0)
    index.ih.push(photo?.height ?? 0)

    if (abv !== null) withAbv += 1
    if (style !== null) withStyle += 1
    if (photo) withPhoto += 1
    if (sparkling) sparklingCount += 1

    // Карточка денормализована: прямой заход на /wine/:slug — ровно один запрос,
    // без справочников и без индекса.
    const detail: WineDetailFile = {
      slug,
      name,
      category: row.Категория,
      colorRaw: row.Цвет,
      colorFamily: deriveColorFamily(row.Цвет),
      region: row.Регион,
      winery: row.Винодельня,
      wineryId: wineries.indexOf.get(row.Винодельня) ?? 0,
      grapeIds: grapeNames.map((grape) => grapes.indexOf.get(grape) ?? 0),
      grapes: grapeNames,
      description: row.Описание,
      style,
      sparkling,
      abv,
      image: photo
        ? {
            thumb: IMG_THUMB(slug),
            detail: IMG_DETAIL(slug),
            width: photo.width,
            height: photo.height,
          }
        : null,
    }
    writeFileSync(join(WINES_DIR, `${slug}.json`), JSON.stringify(detail))
  }

  const abvValues = index.abv.filter((value): value is number => value !== null)
  const grapeCounts = new Array<number>(dict.grapes.length).fill(0)
  for (const list of index.g) {
    for (const grape of list) grapeCounts[grape] = (grapeCounts[grape] ?? 0) + 1
  }

  const facets: WineFacetsFile = {
    categories: countBy(index.c, dict.categories.length),
    regions: countBy(index.r, dict.regions.length),
    styles: countBy(index.st, dict.styles.length),
    grapes: grapeCounts.map((count, value) => ({ value, count })),
    wineries: countBy(index.w, dict.wineries.length),
    ranges: {
      abv: {
        min: Math.floor(Math.min(...abvValues)),
        max: Math.ceil(Math.max(...abvValues)),
        step: 0.5,
      },
    },
    totals: {
      all: rows.length,
      withPhoto,
      sparkling: sparklingCount,
      withoutStyle: rows.length - withStyle,
      withoutAbv: rows.length - withAbv,
    },
  }

  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(join(DATA_DIR, 'dict.json'), JSON.stringify(dict))
  writeFileSync(join(DATA_DIR, 'wines.index.json'), JSON.stringify(index))
  writeFileSync(join(DATA_DIR, 'facets.json'), JSON.stringify(facets))

  const kb = (value: string): string => (Buffer.byteLength(value) / 1024).toFixed(1)
  const percent = (value: number): string => ((100 * value) / rows.length).toFixed(1)

  console.log(
    [
      `CSV: ${totalRows} строк → ${rows.length} позиций (дублей отброшено ${duplicatesDropped}).`,
      `Крепость: ${withAbv} (${percent(withAbv)}%), диапазон ${facets.ranges.abv.min}–${facets.ranges.abv.max}%.`,
      `Стиль: ${withStyle} (${percent(withStyle)}%). Игристых: ${sparklingCount}. Фото: ${withPhoto} (${percent(withPhoto)}%).`,
      `Справочники: категорий ${dict.categories.length}, регионов ${dict.regions.length}, сортов ${dict.grapes.length}, виноделен ${dict.wineries.length}.`,
      `Индекс: ${kb(JSON.stringify(index))} КБ. Карточек записано: ${rows.length}.`,
      `Готово за ${((Date.now() - started) / 1000).toFixed(1)} с.`,
    ].join('\n'),
  )
}

main()
