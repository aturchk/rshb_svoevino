import { computed, ref, watch } from 'vue'

import type { WineQuery } from '@/entities/wine'

import { parseQuery, serializeQuery } from './query-params'

/** Запись поиска в URL откладывается; список обновляется мгновенно. */
const URL_SYNC_DEBOUNCE_MS = 250

/**
 * Три разных времени, разведённых намеренно:
 *
 *  1. Значение поля ввода — локальное, 0 мс. Иначе каретка прыгает.
 *  2. Применение фильтра к списку — тоже 0 мс: полный проход замерен
 *     в 0.344 мс, откладывать нечего.
 *  3. Запись в URL — debounce 250 мс и всегда replace, чтобы набор слова
 *     «шардоне» не положил в историю семь записей и «назад» продолжал работать.
 */
export function useWineQuery() {
  const route = useRoute()
  const router = useRouter()

  const urlQuery = computed(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string') params.set(key, value)
    }
    return parseQuery(params)
  })

  const text = ref(urlQuery.value.text)
  const abvDraft = ref<[number, number] | null>(
    urlQuery.value.abvMin !== null && urlQuery.value.abvMax !== null
      ? [urlQuery.value.abvMin, urlQuery.value.abvMax]
      : null,
  )

  // «Назад» обязан вернуть текст в поле и положение ползунка.
  watch(urlQuery, (next) => {
    if (next.text !== text.value) text.value = next.text
    const range: [number, number] | null =
      next.abvMin !== null && next.abvMax !== null ? [next.abvMin, next.abvMax] : null
    if (JSON.stringify(range) !== JSON.stringify(abvDraft.value)) abvDraft.value = range
  })

  /** Запрос, по которому реально фильтруем: берёт мгновенные локальные значения. */
  const query = computed<WineQuery>(() => ({
    ...urlQuery.value,
    text: text.value,
    abvMin: abvDraft.value?.[0] ?? null,
    abvMax: abvDraft.value?.[1] ?? null,
  }))

  function commit(next: WineQuery) {
    void router.replace({ query: Object.fromEntries(serializeQuery(next)) })
  }

  let timer = 0
  watch(text, (value) => {
    if (value === urlQuery.value.text) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => commit({ ...urlQuery.value, text: value }), URL_SYNC_DEBOUNCE_MS)
  })

  /** Чипы и тумблеры пишутся в URL сразу — они не стреляют по символу. */
  function update(patch: Partial<WineQuery>) {
    commit({ ...query.value, ...patch })
  }

  function toggleValue(
    facet: 'categories' | 'regions' | 'styles' | 'grapes' | 'wineries',
    value: number,
  ) {
    const current = query.value[facet]
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    commit({ ...query.value, [facet]: next })
  }

  function reset() {
    text.value = ''
    abvDraft.value = null
    void router.replace({ query: {} })
  }

  return { query, text, abvDraft, update, toggleValue, commitAbv: () => commit(query.value), reset }
}
