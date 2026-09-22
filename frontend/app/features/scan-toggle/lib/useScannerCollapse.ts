import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const DURATION_MS = 280

/**
 * Сворачивание видоискателя без анимации layout.
 *
 * Панель — фиксированный оверлей, место под неё резервирует распорка в потоке.
 * В кадре 0 распорка схлопывается (документ мгновенно принимает финальную высоту),
 * и тут же контенту выдаётся компенсирующий transform — визуально ничего не сдвинулось.
 * Со следующего кадра включается transition, и анимируются только transform и opacity.
 * Поэтому нет ни пустой полосы внизу страницы, ни рывка в конце, ни правки scrollTop.
 */
export function useScannerCollapse() {
  // useState переживает переход между разделами и безопасен при SSR.
  const collapsed = useState('scanner-collapsed', () => false)

  const panel = ref<HTMLElement | null>(null)
  const shell = ref<HTMLElement | null>(null)
  const height = ref(0)

  let measured = 0
  let animating = false
  let cleanup: (() => void) | null = null
  let observer: ResizeObserver | null = null

  function syncToken() {
    if (!import.meta.client) return
    document.documentElement.style.setProperty(
      '--scanner-h',
      collapsed.value ? '0px' : `${measured}px`,
    )
  }

  onMounted(() => {
    if (!panel.value) return
    // Подписку не снимаем после первого замера: панель меняет высоту при
    // повороте экрана и при переносе текста на другое число строк.
    observer = new ResizeObserver(([entry]) => {
      const next = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect.height ?? 0
      if (next <= 0) return
      measured = next
      // Во время анимации высота «плывёт» — иначе распорка начнёт дёргаться.
      if (!animating) {
        height.value = next
        syncToken()
      }
    })
    observer.observe(panel.value)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    cleanup?.()
  })

  watch(collapsed, async (isCollapsed) => {
    await nextTick()
    const panelEl = panel.value
    const shellEl = shell.value
    const distance = measured
    if (!panelEl || !shellEl || distance === 0) {
      syncToken()
      return
    }

    // Предыдущая анимация могла не доиграть: повторный жест меняет направление.
    cleanup?.()
    syncToken()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panelEl.style.cssText = ''
      shellEl.style.cssText = ''
      panelEl.style.visibility = isCollapsed ? 'hidden' : 'visible'
      return
    }

    animating = true
    panelEl.style.transition = 'none'
    shellEl.style.transition = 'none'
    panelEl.style.visibility = 'visible'
    panelEl.style.willChange = 'transform, opacity'
    shellEl.style.willChange = 'transform'
    panelEl.style.transform = isCollapsed ? 'translateY(0)' : 'translateY(-100%)'
    panelEl.style.opacity = isCollapsed ? '1' : '0'
    shellEl.style.transform = `translateY(${isCollapsed ? distance : -distance}px)`

    let frame = 0
    let timer = 0

    /**
     * Фильтр по цели и свойству обязателен: без него transition фона у кнопки
     * внутри панели всплывает наверх и обрывает сворачивание на середине,
     * оставляя панель в промежуточном состоянии.
     */
    const finish = (event?: TransitionEvent) => {
      if (event && (event.target !== panelEl || event.propertyName !== 'transform')) return
      panelEl.removeEventListener('transitionend', finish)
      panelEl.removeEventListener('transitioncancel', finish)
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      cleanup = null
      animating = false
      panelEl.style.transition = ''
      shellEl.style.transition = ''
      panelEl.style.willChange = ''
      shellEl.style.willChange = ''
      shellEl.style.transform = ''
      if (isCollapsed) {
        panelEl.style.visibility = 'hidden'
      } else {
        panelEl.style.transform = ''
        panelEl.style.opacity = ''
      }
      // Высота могла измениться, пока шла анимация.
      height.value = measured
      syncToken()
    }
    cleanup = () => finish()

    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const easing = `${DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
        panelEl.style.transition = `transform ${easing}, opacity ${easing}`
        shellEl.style.transition = `transform ${easing}`
        panelEl.style.transform = isCollapsed ? 'translateY(-100%)' : 'translateY(0)'
        panelEl.style.opacity = isCollapsed ? '0' : '1'
        shellEl.style.transform = 'translateY(0)'
      })
    })

    // transitioncancel прилетает не во всех браузерах — страхуемся таймером.
    timer = window.setTimeout(() => finish(), DURATION_MS + 80)
    panelEl.addEventListener('transitionend', finish)
    panelEl.addEventListener('transitioncancel', finish)
  })

  return {
    collapsed,
    panel,
    shell,
    height,
    toggle: () => {
      collapsed.value = !collapsed.value
    },
    expand: () => {
      collapsed.value = false
    },
  }
}
