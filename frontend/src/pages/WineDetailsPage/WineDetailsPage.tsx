import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { loadWine } from '@/entities/wine/api/loadDataset'
import type { Wine } from '@/entities/wine'
import { PARAM } from '@/features/wine-filters'
import { ROUTES } from '@/shared/config/routes'
import { Skeleton } from '@/shared/ui/Skeleton'
import { BottleImage } from '@/shared/ui/BottleImage'

import styles from './WineDetailsPage.module.css'

/**
 * Карточка сгруппирована по четырём блокам из ТЗ.
 * Блок «оценки» не рендерится: в выданном датасете нет ни рейтинга, ни отзывов
 * ни в одном из девяти полей, а рисовать пустую плашку как данные нельзя.
 * Точка расширения описана в конце файла.
 */
export function WineDetailsPage() {
  const { slug = '' } = useParams()
  // Одна запись состояния вместо трёх setState: результат привязан к своему slug,
  // поэтому при переходе на другое вино старые данные не показываются и
  // сбрасывать состояние синхронно в эффекте не нужно.
  const [entry, setEntry] = useState<{ slug: string; wine: Wine | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadWine(slug, controller.signal)
      .then((loaded) => setEntry({ slug, wine: loaded }))
      .catch(() => {
        if (!controller.signal.aborted) setEntry({ slug, wine: null })
      })
    return () => controller.abort()
  }, [slug])

  const current = entry?.slug === slug ? entry : null
  const wine = current?.wine ?? null
  const notFound = current !== null && current.wine === null

  if (notFound) {
    return (
      <section>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Вино не найдено</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>
          В каталоге «Своё Вино» нет позиции с адресом «{slug}».
        </p>
        <Link to={ROUTES.catalog} className={styles.link}>
          Вернуться в каталог
        </Link>
      </section>
    )
  }

  if (!wine) {
    return (
      <section>
        <Skeleton width="180px" height="20px" />
        <div style={{ height: 24 }} />
        <Skeleton width="100%" height="320px" radius="var(--radius-lg)" />
      </section>
    )
  }

  const tags = [
    wine.category,
    wine.style,
    wine.sparkling ? 'Игристое' : null,
    wine.abv !== null ? `${String(wine.abv).replace('.', ',')} % об.` : null,
  ].filter((value): value is string => Boolean(value))

  return (
    <article>
      <Link to={ROUTES.catalog} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Каталог
      </Link>

      {/* Основное */}
      <div className={styles.hero}>
        <div className={styles.photo}>
          <BottleImage
            src={wine.image ? `${import.meta.env.BASE_URL}${wine.image.detail}` : null}
            width={wine.image?.width ?? 0}
            height={wine.image?.height ?? 0}
            alt={wine.name}
            category={wine.category}
            boxWidth={112}
            eager
          />
        </div>
        <div className={styles.headline}>
          <h1 className={styles.title}>{wine.name}</h1>
          <div className={styles.tags}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
            {wine.style === null && (
              <span className={`${styles.tag} ${styles.tagMuted}`}>Сахар не указан</span>
            )}
          </div>
          <p className={styles.description}>{wine.description}</p>
        </div>
      </div>

      <div className={styles.blocks}>
        {/* Происхождение */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Происхождение</h2>
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.key}>Винодельня</dt>
              <dd className={styles.value}>
                <Link
                  to={`${ROUTES.catalog}?${PARAM.wineries}=${wine.wineryId}`}
                  className={styles.link}
                >
                  {wine.winery}
                </Link>
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.key}>Регион</dt>
              <dd className={styles.value}>{wine.region}</dd>
            </div>
          </dl>
        </section>

        {/* Характеристики */}
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Характеристики</h2>
          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt className={styles.key}>Сорт винограда</dt>
              <dd className={styles.value}>
                <span className={styles.grapes}>
                  {wine.grapes.length > 0
                    ? wine.grapes.map((grape, position) => (
                        <Link
                          key={grape}
                          to={`${ROUTES.catalog}?${PARAM.grapes}=${wine.grapeIds[position] ?? 0}`}
                          className={styles.grape}
                        >
                          {grape}
                        </Link>
                      ))
                    : '—'}
                </span>
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.key}>Цвет</dt>
              <dd className={styles.value}>
                {wine.colorRaw}
                {wine.colorFamily !== 'Прочее' && wine.colorFamily !== wine.colorRaw && (
                  <span style={{ color: 'var(--color-text-muted)' }}> · {wine.colorFamily}</span>
                )}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.key}>Крепость</dt>
              <dd className={styles.value}>
                {wine.abv !== null ? (
                  `${String(wine.abv).replace('.', ',')} % об.`
                ) : (
                  <span className={styles.absent}>в каталоге не указана</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  )
}

/*
 * Точка расширения под блок «Оценки»:
 *   1. Добавить поле `rating` в WineDetailFile (shared/config/dataset-schema.ts)
 *      и заполнить его в scripts/build-dataset.ts, когда заказчик отдаст оценки.
 *   2. Отрисовать плашкой в брендовом цвете #f8ecc9 — так рейтинг выглядит
 *      на карточках vino-svoe.ru.
 * До этого момента блок не рендерится: показывать пустую шкалу как данные нельзя.
 */
