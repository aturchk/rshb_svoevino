import { Link } from 'react-router-dom'

import { ROUTES } from '@/shared/config/routes'

export function NotFoundPage() {
  return (
    <section style={{ textAlign: 'center', paddingBlock: 64 }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Страница не найдена</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <Link to={ROUTES.catalog} style={{ color: 'var(--color-accent)' }}>
        Перейти в каталог
      </Link>
    </section>
  )
}
