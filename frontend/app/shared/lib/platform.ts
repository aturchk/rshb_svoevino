export type Platform = 'ios' | 'android' | 'other'

/**
 * Платформа — только чтобы дать правильную инструкцию «как разрешить камеру»:
 * на iOS и Android путь к настройке разный. Для логики интерфейса не используется.
 */
export function detectPlatform(): Platform {
  if (!import.meta.client) return 'other'
  const agent = navigator.userAgent
  // iPadOS 13+ представляется Mac-ом с тачскрином.
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  return /Android/.test(agent) ? 'android' : 'other'
}
