import { create } from 'zustand'

import type { Dataset } from '../api/loadDataset'
import { loadDataset } from '../api/loadDataset'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface DatasetState {
  status: Status
  data: Dataset | null
  error: string | null
  ensureLoaded: () => void
}

/**
 * Датасет живёт в сторе, а не в состоянии страницы: при переходе
 * каталог → карточка → назад он не должен перезагружаться.
 * Фильтры здесь НЕ хранятся — их единственный источник правды это URL.
 */
export const useDatasetStore = create<DatasetState>((set, get) => ({
  status: 'idle',
  data: null,
  error: null,
  ensureLoaded: () => {
    const { status } = get()
    if (status === 'loading' || status === 'ready') return
    set({ status: 'loading', error: null })
    loadDataset()
      .then((data) => set({ status: 'ready', data }))
      .catch((error: unknown) =>
        set({
          status: 'error',
          error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        }),
      )
  },
}))
