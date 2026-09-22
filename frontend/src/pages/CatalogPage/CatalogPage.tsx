import { useEffect, useMemo, useState } from 'react'

import { loadDataset } from '@/entities/wine/api/loadDataset'
import { runQuery } from '@/entities/wine/lib/query'
import { countActiveFilters, hasActiveFilters, serializeQuery } from '@/features/wine-filters'
import { useWineQuery } from '@/features/wine-filters'
import { Button } from '@/shared/ui/Button'
import { Sheet } from '@/shared/ui/Sheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { winesPlural } from '@/shared/lib/plural'
import { CatalogList } from '@/widgets/CatalogList'
import { FilterPanel } from '@/widgets/FilterPanel'

import styles from './CatalogPage.module.css'

type Dataset = Awaited<ReturnType<typeof loadDataset>>

export function CatalogPage() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { query, text, setText, abvDraft, setAbvDraft, commitAbv, update, toggleValue, reset } =
    useWineQuery()

  // Датасет грузится при открытии каталога, а не на титульном экране.
  useEffect(() => {
    const controller = new AbortController()
    loadDataset(controller.signal)
      .then(setDataset)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Не удалось загрузить каталог')
      })
    return () => controller.abort()
  }, [])

  const signature = useMemo(() => serializeQuery(query).toString(), [query])

  // Ключ мемоизации — строка, а не объект запроса: объект пересоздаётся каждый рендер.
  const result = useMemo(
    () => (dataset ? runQuery(dataset.index, query) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, signature, query.text, query.abvMin, query.abvMax],
  )

  const activeCount = countActiveFilters(query)
  const canReset = hasActiveFilters(query)

  const filters = dataset && result && (
    <FilterPanel
      index={dataset.index}
      facets={dataset.facets}
      query={query}
      counts={result.counts}
      abvDraft={abvDraft}
      onAbvChange={setAbvDraft}
      onAbvCommit={commitAbv}
      onToggle={toggleValue}
      onUpdate={update}
    />
  )

  return (
    <section>
      <h1 className="visually-hidden">Каталог вин «Своё Вино»</h1>

      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <input
            type="search"
            className={styles.search}
            placeholder="Название вина или винодельня"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Поиск по каталогу"
          />
          <button
            type="button"
            className={styles.filtersButton}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            Фильтры
            {activeCount > 0 && <span className={styles.filtersBadge}>{activeCount}</span>}
          </button>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.count} aria-live="polite">
            {result
              ? `Найдено ${result.ids.length} ${winesPlural(result.ids.length)}`
              : 'Загружаем каталог…'}
          </span>
          {canReset && (
            <button type="button" className={styles.reset} onClick={reset}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.aside} aria-label="Фильтры">
          {filters}
        </aside>

        <div>
          {error && <p className={styles.error}>{error}</p>}

          {!dataset && !error && (
            <div aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={styles.skeletonRow}>
                  <Skeleton width="56px" height="64px" radius="8px" />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="60%" height="18px" />
                    <div style={{ height: 6 }} />
                    <Skeleton width="40%" height="14px" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {dataset && result && result.ids.length === 0 && (
            <div className={styles.empty}>
              <svg width="52" height="52" viewBox="0 0 28 100" fill="none" aria-hidden="true">
                <path
                  d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
              </svg>
              <h2 className={styles.emptyTitle}>Ничего не нашлось</h2>
              <p className={styles.emptyText}>
                Попробуйте убрать часть условий — например, снять ограничение по крепости
                или расширить список регионов.
              </p>
              <Button variant="secondary" onClick={reset}>
                Сбросить фильтры
              </Button>
            </div>
          )}

          {dataset && result && result.ids.length > 0 && (
            <CatalogList index={dataset.index} ids={result.ids} signature={signature} />
          )}
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        title="Фильтры"
        onClose={() => setSheetOpen(false)}
        footer={
          <Button block onClick={() => setSheetOpen(false)}>
            {result ? `Показать ${result.ids.length} ${winesPlural(result.ids.length)}` : 'Показать'}
          </Button>
        }
      >
        {filters}
      </Sheet>
    </section>
  )
}
