/**
 * Тактильный отклик. navigator.vibrate есть в Chrome на Android; Safari на iOS его
 * не поддерживает — там вызов просто ничего не делает. Паттерны короткие:
 * вибрация подтверждает действие, а не развлекает.
 */
const PATTERNS = {
  /** нажатие затвора, выбор чипа */
  tap: 8,
  /** нашли вино */
  success: [12, 60, 18],
  /** не уверены / не нашли */
  warning: [30, 50, 30],
} as const

export type HapticKind = keyof typeof PATTERNS

export function haptic(kind: HapticKind): void {
  if (!import.meta.client || typeof navigator === 'undefined') return
  if (!('vibrate' in navigator)) return
  try {
    const pattern = PATTERNS[kind]
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern])
  } catch {
    // Вибрация бывает запрещена политикой страницы — это не ошибка интерфейса.
  }
}
