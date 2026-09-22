/* eslint-disable react-refresh/only-export-components --
   Это файл маршрутов: он экспортирует конфигурацию роутера, а не компоненты.
   Ленивые обёртки объявлены здесь намеренно, чтобы границы чанков были
   видны в одном месте. */
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'

import { ROUTES } from '@/shared/config/routes'

import { AppLayout } from './layout/AppLayout'
import { HomePage } from './pages-eager'

/**
 * Разделение кода: каталог и карточка грузятся лениво — вместе с ними в главный
 * чанк не попадают ни движок фильтрации, ни загрузчик датасета.
 * Титульный экран и панель сканера остаются в главном чанке: панель — самый
 * заметный элемент первого экрана, ленивая загрузка добавила бы ей лишний
 * сетевой раунд-трип ровно перед показом.
 */
const CatalogPage = lazy(() =>
  import('@/pages/CatalogPage').then((module) => ({ default: module.CatalogPage })),
)
const WineDetailsPage = lazy(() =>
  import('@/pages/WineDetailsPage').then((module) => ({ default: module.WineDetailsPage })),
)
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: ROUTES.home, element: <HomePage /> },
      { path: ROUTES.history, element: <HistoryPage /> },
      { path: ROUTES.catalog, element: <CatalogPage /> },
      { path: ROUTES.wine, element: <WineDetailsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
