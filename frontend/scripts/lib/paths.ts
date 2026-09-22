import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Пути резолвим от файла, а не от process.cwd() — скрипт должен работать из любой директории. */
const here = dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = resolve(here, '../..')

/** Датасет лежит вне пакета: тянуть 1.3 ГБ внутрь frontend/ нельзя. */
export const DATASET_DIR = resolve(PROJECT_ROOT, process.env.DATASET_DIR ?? '../dataset')
export const CSV_PATH = resolve(DATASET_DIR, 'strapi_output0709.csv')
export const UPLOAD_DIRS = [
  'prod-svoe-vino-1/uploads',
  'prod-svoe-vino-2/uploads',
  'prod-svoe-vino-3/uploads',
].map((relative) => resolve(DATASET_DIR, relative))

export const PUBLIC_DIR = resolve(PROJECT_ROOT, 'public')
export const DATA_DIR = resolve(PUBLIC_DIR, 'data')
export const WINES_DIR = resolve(DATA_DIR, 'wines')
export const IMG_DIR = resolve(PUBLIC_DIR, 'img')
export const IMG_MANIFEST = resolve(IMG_DIR, 'images.manifest.json')

export function assertDataset(): void {
  if (!existsSync(CSV_PATH)) {
    throw new Error(
      `Не найден каталог: ${CSV_PATH}\n` +
        'Укажите путь через переменную окружения DATASET_DIR.',
    )
  }
}
