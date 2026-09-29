import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import sharp from 'sharp'

import { imageDhash } from '../server/utils/dhash-core'

interface GalleryItem {
  slug: string
  image_path: string
  image_sha256: string
}

const root = resolve(import.meta.dirname, '../..')
const galleryPath = resolve(root, 'work/gallery-strict.jsonl')
const outputPath = resolve(root, 'frontend/server/assets/dhash-index.json')
const lines = (await readFile(galleryPath, 'utf8')).trim().split('\n')
const items = lines.map((line) => JSON.parse(line) as GalleryItem)
if (items.length !== 928 || new Set(items.map((item) => item.slug)).size !== items.length) {
  throw new Error('Unexpected strict gallery size or duplicate slug')
}

const entries: [string, string][] = []
for (const item of items) {
  const image = await readFile(resolve(root, item.image_path))
  const sha = createHash('sha256').update(image).digest('hex')
  if (sha !== item.image_sha256) throw new Error(`Image SHA-256 mismatch: ${item.slug}`)
  entries.push([item.slug, await imageDhash(image)])
}

await mkdir(resolve(root, 'frontend/server/assets'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify({
  version: 1,
  hashSize: 16,
  sharpVersion: sharp.versions.sharp,
  gallerySha256: createHash('sha256').update(await readFile(galleryPath)).digest('hex'),
  entries,
})}\n`)
console.info(`Saved ${entries.length} reference hashes to ${outputPath}`)
