/**
 * Эндпоинты бэкенда (server/api/v1). Единственный источник правды по путям:
 * фронтенд и документация ссылаются сюда, а не на строковые литералы.
 */
export const API = {
  wine: (slug: string): string => `/api/v1/wines/${encodeURIComponent(slug)}`,
  analogs: '/api/v1/analogs',
  recognize: '/api/v1/recognize',
  sommelier: '/api/v1/sommelier',
} as const
