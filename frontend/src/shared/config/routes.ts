/** Единственный источник правды по маршрутам: строковых литералов в коде быть не должно. */
export const ROUTES = {
  home: '/',
  history: '/history',
  catalog: '/catalog',
  wine: '/wine/:slug',
} as const

export const wineRoute = (slug: string): string => `/wine/${slug}`
