import type {
  WineDetailFile,
  WineDict,
  WineFacetsFile,
  WineIndexFile,
} from '@/shared/config/dataset-schema'
import { DICT_FILE, FACETS_FILE, INDEX_FILE, wineFile } from '@/shared/config/dataset-schema'

import { buildWineIndex } from '../lib/build-index'
import type { WineIndex } from '../model/types'

/** Датасет только по сети и только по требованию: статический импорт утянул бы его в бандл. */
async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal: signal ?? null })
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`)
  }
  return (await response.json()) as T
}

export interface Dataset {
  index: WineIndex
  facets: WineFacetsFile
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  // Три файла параллельно, а не цепочкой: зависимостей между ними нет.
  const [dict, file, facets] = await Promise.all([
    fetchJson<WineDict>(DICT_FILE, signal),
    fetchJson<WineIndexFile>(INDEX_FILE, signal),
    fetchJson<WineFacetsFile>(FACETS_FILE, signal),
  ])

  return { index: buildWineIndex(dict, file), facets }
}

/**
 * Карточка вина: денормализована, поэтому прямой заход на /wine/:slug —
 * ровно один запрос, без индекса и без справочников.
 */
export function loadWine(slug: string, signal?: AbortSignal): Promise<WineDetailFile> {
  return fetchJson<WineDetailFile>(wineFile(slug), signal)
}
