/** Единственный источник правды по маршрутам: строковых литералов в коде быть не должно. */
export const ROUTES = {
  scan: '/scan',
  catalog: '/catalog',
  history: '/history',
} as const

export const wineRoute = (slug: string): string => `/wine/${slug}`
