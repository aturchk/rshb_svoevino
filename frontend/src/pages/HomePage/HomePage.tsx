import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '@/shared/config/routes'
import { Button } from '@/shared/ui/Button'

import styles from './HomePage.module.css'

/** Предзагрузка каталога: низкий приоритет, уже после первой отрисовки. */
function prefetchCatalog(): void {
  void import('@/pages/CatalogPage')
}

export function HomePage() {
  const navigate = useNavigate()

  useEffect(() => {
    // requestIdleCallback есть не везде — деградируем в таймер.
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1200))
    const handle = schedule(prefetchCatalog)
    return () => {
      if (window.cancelIdleCallback && typeof handle === 'number') window.cancelIdleCallback(handle)
    }
  }, [])

  const goToCatalog = useCallback(() => {
    void navigate(ROUTES.catalog)
  }, [navigate])

  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>Узнайте вино по этикетке</h1>
      <p className={styles.subtitle}>
        Наведите камеру на бутылку российского вина — и получите карточку с регионом,
        сортом, винодельней и дегустационным описанием из каталога «Своё Вино».
      </p>

      <div className={styles.actions}>
        <Button size="lg" onClick={goToCatalog} onMouseEnter={prefetchCatalog} onFocus={prefetchCatalog}>
          Смотреть каталог
        </Button>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dd className={styles.statValue}>2103</dd>
          <dt className={styles.statLabel}>вина в каталоге</dt>
        </div>
        <div className={styles.stat}>
          <dd className={styles.statValue}>135</dd>
          <dt className={styles.statLabel}>виноделен</dt>
        </div>
        <div className={styles.stat}>
          <dd className={styles.statValue}>9</dd>
          <dt className={styles.statLabel}>винодельческих регионов</dt>
        </div>
        <div className={styles.stat}>
          <dd className={styles.statValue}>140</dd>
          <dt className={styles.statLabel}>сортов винограда</dt>
        </div>
      </dl>
    </section>
  )
}
