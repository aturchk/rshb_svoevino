import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import type { WineQuery } from '@/entities/wine'
import { EMPTY_QUERY } from '@/entities/wine'
import { URL_SYNC_DEBOUNCE_MS } from '@/shared/config/constants'

import { parseQuery, serializeQuery } from './query-params'

/**
 * Три разных времени, разведённых намеренно:
 *
 *  1. Значение поля ввода — локальный стейт, 0 мс. Иначе каретка прыгает.
 *  2. Применение фильтра к списку — тоже 0 мс: полный проход замерен в 0.344 мс,
 *     откладывать нечего, список и счётчик обновляются на каждое нажатие.
 *  3. Запись в URL — debounce 250 мс и всегда replace, чтобы набор слова
 *     «шардоне» не положил в историю семь записей и «назад» продолжал работать.
 */
export function useWineQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const paramsKey = searchParams.toString()
  const urlQuery = useMemo(() => parseQuery(new URLSearchParams(paramsKey)), [paramsKey])

  const [text, setText] = useState(urlQuery.text)
  const [abvDraft, setAbvDraft] = useState<[number, number] | null>(
    urlQuery.abvMin !== null && urlQuery.abvMax !== null
      ? [urlQuery.abvMin, urlQuery.abvMax]
      : null,
  )

  // «Назад» обязан вернуть текст в поле и положение ползунка.
  const lastLocationKey = useRef(location.key)
  useEffect(() => {
    if (lastLocationKey.current === location.key) return
    lastLocationKey.current = location.key
    const restored = parseQuery(new URLSearchParams(paramsKey))
    setText(restored.text)
    setAbvDraft(
      restored.abvMin !== null && restored.abvMax !== null
        ? [restored.abvMin, restored.abvMax]
        : null,
    )
  }, [location.key, paramsKey])

  /** Запрос, по которому реально фильтруем: берёт мгновенные локальные значения. */
  const query: WineQuery = useMemo(
    () => ({
      ...urlQuery,
      text,
      abvMin: abvDraft?.[0] ?? null,
      abvMax: abvDraft?.[1] ?? null,
    }),
    [urlQuery, text, abvDraft],
  )

  const commit = useCallback(
    (next: WineQuery) => {
      setSearchParams(serializeQuery(next), { replace: true })
    },
    [setSearchParams],
  )

  // Отложенная запись текста в URL.
  useEffect(() => {
    if (text === urlQuery.text) return
    const timer = window.setTimeout(() => commit({ ...urlQuery, text }), URL_SYNC_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text, urlQuery, commit])

  /** Чипы и тумблеры пишутся в URL сразу — они не стреляют по символу. */
  const update = useCallback(
    (patch: Partial<WineQuery>) => {
      commit({ ...query, ...patch })
    },
    [commit, query],
  )

  const toggleValue = useCallback(
    (facet: 'categories' | 'regions' | 'styles' | 'grapes' | 'wineries', value: number) => {
      const current = query[facet]
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      commit({ ...query, [facet]: next })
    },
    [commit, query],
  )

  /** Ползунок двигает список мгновенно, а URL обновляет по отпусканию. */
  const commitAbv = useCallback(() => {
    commit(query)
  }, [commit, query])

  const reset = useCallback(() => {
    setText('')
    setAbvDraft(null)
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  return {
    query,
    text,
    setText,
    abvDraft,
    setAbvDraft,
    commitAbv,
    update,
    toggleValue,
    reset,
    isDefault: serializeQuery(query).toString() === serializeQuery(EMPTY_QUERY).toString(),
  }
}
