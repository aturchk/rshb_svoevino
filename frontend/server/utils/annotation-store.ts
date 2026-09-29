import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

import type { H3Event } from 'h3'

const MANIFEST_COLUMNS = [
  'query_id',
  'image_path',
  'image_sha256',
  'source_kind',
  'parent_query_id',
  'bottle_group_id',
  'split',
  'label_status',
  'true_slug',
  'review_status',
  'reviewer_ids',
  'adjudicator_id',
  'capture_session_id',
  'glare',
  'blur',
  'perspective',
  'occlusion',
  'lighting',
  'label_visibility',
  'multiple_bottles',
  'label_bbox_xyxy',
  'visible_year',
  'visible_text',
  'notes',
] as const

type ManifestColumn = (typeof MANIFEST_COLUMNS)[number]
type ManifestRow = Record<ManifestColumn, string>

export interface AnnotationQuery {
  queryId: string
  fileName: string
  imageSha256: string
  labelStatus: string
  trueSlug: string
  reviewStatus: string
  reviewerIds: string
}

export interface CatalogChoice {
  slug: string
  wineName: string
  winery: string
  category: string
  region: string
  grape: string
  galleryState: string
  hasReference: boolean
}

export type AnnotationLabelStatus = 'confirmed' | 'not_in_catalog' | 'uncertain' | 'exclude'

export interface SaveAnnotationInput {
  queryId: string
  imageSha256: string
  labelStatus: AnnotationLabelStatus
  trueSlug?: string
  reviewerId: string
}

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const REVIEWER_ID = /^[\p{L}\p{N}._-]{1,40}$/u
const QUERY_ID = /^field-\d{6}$/

function repositoryRoot(): string {
  return resolve(process.env.ANNOTATION_REPO_ROOT || join(process.cwd(), '..'))
}

function manifestPath(): string {
  return join(repositoryRoot(), 'data', 'field_mapping.tsv')
}

function catalogPath(): string {
  return join(repositoryRoot(), 'data', 'catalog_lookup.tsv')
}

export function assertAnnotationEnabled(event: H3Event): void {
  if (process.env.NUXT_ANNOTATION_ENABLED === 'true') return
  const host = getHeader(event, 'host') ?? ''
  const loopback = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/.test(host)
  if (!import.meta.dev || !loopback) {
    throw createError({ statusCode: 404, message: 'Annotation UI is disabled' })
  }
}

function parseTsv<Row extends Record<string, string>>(source: string): Row[] {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  const header = lines.shift()?.split('\t') ?? []
  return lines.map((line) => {
    const values = line.split('\t')
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? ''])) as Row
  })
}

function serializeManifest(rows: ManifestRow[]): string {
  const lines = rows.map((row) => MANIFEST_COLUMNS.map((column) => row[column] ?? '').join('\t'))
  return `${MANIFEST_COLUMNS.join('\t')}\n${lines.join('\n')}\n`
}

async function readManifest(): Promise<ManifestRow[]> {
  const rows = parseTsv<ManifestRow>(await readFile(manifestPath(), 'utf8'))
  if (rows.some((row) => !row.query_id || !row.image_path || !row.image_sha256)) {
    throw createError({ statusCode: 500, message: 'Field manifest has an invalid schema' })
  }
  return rows
}

let catalogPromise: Promise<CatalogChoice[]> | null = null

export function readAnnotationCatalog(): Promise<CatalogChoice[]> {
  if (catalogPromise) return catalogPromise
  const loading = readFile(catalogPath(), 'utf8')
    .then((source) =>
      parseTsv<Record<string, string>>(source).map((row) => ({
        slug: row.slug ?? '',
        wineName: row.wine_name ?? '',
        winery: row.winery ?? '',
        category: row.category ?? '',
        region: row.region ?? '',
        grape: row.grape ?? '',
        galleryState: row.gallery_state ?? '',
        hasReference: Boolean(row.reference_image_path),
      })),
    )
    .catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
  catalogPromise = loading
  return loading
}

function publicQuery(row: ManifestRow): AnnotationQuery {
  return {
    queryId: row.query_id,
    fileName: basename(row.image_path),
    imageSha256: row.image_sha256,
    labelStatus: row.label_status,
    trueSlug: row.true_slug,
    reviewStatus: row.review_status,
    reviewerIds: row.reviewer_ids,
  }
}

export async function readAnnotationState(): Promise<{
  queries: AnnotationQuery[]
  catalog: CatalogChoice[]
}> {
  const [rows, catalog] = await Promise.all([readManifest(), readAnnotationCatalog()])
  return { queries: rows.map(publicQuery), catalog }
}

function safeRepositoryPath(relativePath: string): string {
  const root = repositoryRoot()
  const path = resolve(root, relativePath)
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw createError({ statusCode: 400, message: 'Unsafe image path' })
  }
  return path
}

export async function openQueryImage(queryId: string): Promise<{
  stream: ReturnType<typeof createReadStream>
  mimeType: string
}> {
  if (!QUERY_ID.test(queryId)) throw createError({ statusCode: 404, message: 'Photo not found' })
  const row = (await readManifest()).find((candidate) => candidate.query_id === queryId)
  if (!row) throw createError({ statusCode: 404, message: 'Photo not found' })
  const path = safeRepositoryPath(row.image_path)
  const mimeType = MIME_TYPES[extname(path).toLowerCase()]
  if (!mimeType) throw createError({ statusCode: 415, message: 'Unsupported image format' })
  return { stream: createReadStream(path), mimeType }
}

export async function openReferenceImage(slug: string): Promise<{
  stream: ReturnType<typeof createReadStream>
  mimeType: string
}> {
  const source = await readFile(catalogPath(), 'utf8')
  const row = parseTsv<Record<string, string>>(source).find((candidate) => candidate.slug === slug)
  if (!row?.reference_image_path) {
    throw createError({ statusCode: 404, message: 'Reference image not found' })
  }
  const path = safeRepositoryPath(row.reference_image_path)
  const mimeType = MIME_TYPES[extname(path).toLowerCase()]
  if (!mimeType) throw createError({ statusCode: 415, message: 'Unsupported image format' })
  return { stream: createReadStream(path), mimeType }
}

let writeQueue: Promise<void> = Promise.resolve()
let backupCreated = false

async function persistAnnotation(input: SaveAnnotationInput): Promise<AnnotationQuery> {
  if (!QUERY_ID.test(input.queryId)) {
    throw createError({ statusCode: 400, message: 'Invalid query ID' })
  }
  if (!/^[a-f0-9]{64}$/.test(input.imageSha256)) {
    throw createError({ statusCode: 400, message: 'Invalid image hash' })
  }
  if (!REVIEWER_ID.test(input.reviewerId)) {
    throw createError({ statusCode: 400, message: 'Reviewer ID must be 1–40 letters or digits' })
  }
  const allowedStatuses = new Set<AnnotationLabelStatus>([
    'confirmed',
    'not_in_catalog',
    'uncertain',
    'exclude',
  ])
  if (!allowedStatuses.has(input.labelStatus)) {
    throw createError({ statusCode: 400, message: 'Invalid label status' })
  }

  const [rows, catalog] = await Promise.all([readManifest(), readAnnotationCatalog()])
  const row = rows.find((candidate) => candidate.query_id === input.queryId)
  if (!row) throw createError({ statusCode: 404, message: 'Photo not found' })
  if (row.image_sha256 !== input.imageSha256) {
    throw createError({ statusCode: 409, message: 'Photo changed; reload the annotation page' })
  }
  if (row.review_status === 'double_agreed' || row.review_status === 'adjudicated') {
    throw createError({ statusCode: 409, message: 'A finalized annotation cannot be overwritten here' })
  }

  const slug = input.trueSlug?.trim() ?? ''
  if (input.labelStatus === 'confirmed') {
    if (!slug || !catalog.some((candidate) => candidate.slug === slug)) {
      throw createError({ statusCode: 400, message: 'Choose an exact catalog wine' })
    }
  } else if (slug) {
    throw createError({ statusCode: 400, message: 'Only confirmed rows can contain a slug' })
  }

  row.label_status = input.labelStatus
  row.true_slug = input.labelStatus === 'confirmed' ? slug : ''
  row.review_status = 'single_reviewed'
  row.reviewer_ids = input.reviewerId
  row.adjudicator_id = ''

  const target = manifestPath()
  if (!backupCreated) {
    const backupDirectory = join(repositoryRoot(), 'work', 'annotation-backups')
    await mkdir(backupDirectory, { recursive: true })
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
    await copyFile(target, join(backupDirectory, `field_mapping.${timestamp}.tsv`))
    backupCreated = true
  }
  const temporary = join(dirname(target), `.field_mapping.${process.pid}.tmp`)
  await writeFile(temporary, serializeManifest(rows), 'utf8')
  await rename(temporary, target)
  return publicQuery(row)
}

export function saveAnnotation(input: SaveAnnotationInput): Promise<AnnotationQuery> {
  const result = writeQueue.then(() => persistAnnotation(input))
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
