import type { Ref } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Модальный диалог: Tab не уходит за его пределы, Escape закрывает,
 * по закрытии фокус возвращается туда, откуда диалог открыли.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>, onEscape: () => void) {
  let restoreTo: HTMLElement | null = null

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onEscape()
      return
    }
    if (event.key !== 'Tab' || !container.value) return
    const items = [...container.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => item.offsetParent !== null,
    )
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return {
    activate(initial?: HTMLElement | null) {
      restoreTo = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeyDown)
      ;(initial ?? container.value?.querySelector<HTMLElement>(FOCUSABLE))?.focus({
        preventScroll: true,
      })
    },
    deactivate() {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus({ preventScroll: true })
      restoreTo = null
    },
  }
}
