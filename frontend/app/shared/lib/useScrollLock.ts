/**
 * Блокировка прокрутки фона фиксацией, а не overflow: hidden.
 * На iOS Safari overflow: hidden на body не останавливает скролл, а при закрытии
 * страница прыгает в начало. Фиксация с компенсацией top сохраняет позицию.
 * Счётчик — на случай двух шторок подряд: вторая не должна снять блокировку первой.
 */
let locks = 0
let savedScrollY = 0

export function lockScroll(): void {
  if (!import.meta.client) return
  if (locks++ > 0) return
  savedScrollY = window.scrollY
  const { style } = document.body
  style.position = 'fixed'
  style.top = `-${savedScrollY}px`
  style.insetInline = '0'
}

export function unlockScroll(): void {
  if (!import.meta.client || locks === 0) return
  if (--locks > 0) return
  const { style } = document.body
  style.position = ''
  style.top = ''
  style.insetInline = ''
  window.scrollTo({ top: savedScrollY, behavior: 'instant' })
}
