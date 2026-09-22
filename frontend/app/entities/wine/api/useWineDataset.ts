import { ref, shallowRef } from 'vue'

import type {
  WineDict,
  WineFacetsFile,
  WineIndexFile,
} from '@/shared/config/dataset-schema'
import { DICT_FILE, FACETS_FILE, INDEX_FILE } from '@/shared/config/dataset-schema'

import { buildWineIndex } from '../lib/build-index'
import type { WineIndex } from '../model/types'

export interface Dataset {
  index: WineIndex
  facets: WineFacetsFile
}

/**
 * Кэш на уровне модуля: при переходе каталог → карточка → назад датасет
 * не перезагружается и типизированные массивы не пересобираются.
 */
let cache: Dataset | null = null
let inflight: Promise<Dataset> | null = null

function fetchDataset(): Promise<Dataset> {
  if (cache) return Promise.resolve(cache)
  inflight ??= Promise.all([
    // Три файла параллельно, а не цепочкой: зависимостей между ними нет.
    $fetch<WineDict>(`/${DICT_FILE}`),
    $fetch<WineIndexFile>(`/${INDEX_FILE}`),
    $fetch<WineFacetsFile>(`/${FACETS_FILE}`),
  ]).then(([dict, file, facets]) => {
    cache = { index: buildWineIndex(dict, file), facets }
    inflight = null
    return cache
  })
  return inflight
}

/** Прогрев: вызывается заранее, результат никого не ждёт. */
export function warmDataset(): void {
  if (import.meta.client) void fetchDataset().catch(() => undefined)
}

export function useWineDataset() {
  // shallowRef, а не ref: индекс содержит типизированные массивы и постинг-листы,
  // делать их глубоко реактивными — чистая трата времени на прокси.
  const data = shallowRef<Dataset | null>(cache)
  const error = ref<string | null>(null)
  const pending = ref(cache === null)

  if (import.meta.client && !cache) {
    fetchDataset()
      .then((dataset) => {
        data.value = dataset
        pending.value = false
      })
      .catch((cause: unknown) => {
        error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить каталог'
        pending.value = false
      })
  }

  return { data, error, pending }
}
