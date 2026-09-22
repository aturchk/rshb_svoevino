import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { SCANNER_ANIMATION_MS } from '@/shared/config/constants'

import { useScanToggleStore } from '../model/store'

/**
 * Сворачивание сканера без анимации layout.
 *
 * Панель — фиксированный оверлей, место под неё резервирует распорка в потоке.
 * В кадре 0 распорка схлопывается (документ мгновенно принимает финальную высоту),
 * и тут же контенту выдаётся компенсирующий transform — визуально ничего не сдвинулось.
 * Со следующего кадра включается transition, и анимируются только transform и opacity.
 * Поэтому нет ни пустой полосы внизу страницы, ни рывка в конце, ни правки scrollTop.
 */
export function useScannerCollapse() {
  const collapsed = useScanToggleStore((state) => state.collapsed)
  const toggle = useScanToggleStore((state) => state.toggle)

  const panelRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const heightRef = useRef(0)
  const previousCollapsed = useRef(collapsed)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [height, setHeight] = useState(0)

  // Подписку не снимаем после первого замера: панель меняет высоту при
  // повороте экрана и при переносе текста на другое число строк.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect.height ?? 0
      if (next > 0) {
        heightRef.current = next
        setHeight(next)
      }
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (previousCollapsed.current === collapsed) return
    previousCollapsed.current = collapsed

    const panel = panelRef.current
    const shell = shellRef.current
    const distance = heightRef.current
    if (!panel || !shell || distance === 0) return

    // Пользователь просил меньше движения — переключаем мгновенно.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.style.cssText = ''
      shell.style.cssText = ''
      panel.style.visibility = collapsed ? 'hidden' : 'visible'
      panel.style.transform = collapsed ? 'translateY(-100%)' : ''
      panel.style.opacity = collapsed ? '0' : ''
      return
    }

    // Предыдущая анимация могла не доиграть: повторный тап переключает направление.
    cleanupRef.current?.()

    panel.style.transition = 'none'
    shell.style.transition = 'none'
    panel.style.visibility = 'visible'
    panel.style.willChange = 'transform, opacity'
    shell.style.willChange = 'transform'
    panel.style.transform = collapsed ? 'translateY(0)' : 'translateY(-100%)'
    panel.style.opacity = collapsed ? '1' : '0'
    shell.style.transform = `translateY(${collapsed ? distance : -distance}px)`

    let frame = 0
    let timer = 0

    const finish = () => {
      panel.removeEventListener('transitionend', finish)
      panel.removeEventListener('transitioncancel', finish)
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      cleanupRef.current = null
      panel.style.transition = ''
      shell.style.transition = ''
      panel.style.willChange = ''
      shell.style.willChange = ''
      shell.style.transform = ''
      if (collapsed) {
        panel.style.visibility = 'hidden'
      } else {
        panel.style.transform = ''
        panel.style.opacity = ''
      }
    }
    cleanupRef.current = finish

    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const easing = `${SCANNER_ANIMATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
        panel.style.transition = `transform ${easing}, opacity ${easing}`
        shell.style.transition = `transform ${easing}`
        panel.style.transform = collapsed ? 'translateY(-100%)' : 'translateY(0)'
        panel.style.opacity = collapsed ? '0' : '1'
        shell.style.transform = 'translateY(0)'
      })
    })

    // transitioncancel прилетает не во всех браузерах — страхуемся таймером.
    timer = window.setTimeout(finish, SCANNER_ANIMATION_MS + 80)
    panel.addEventListener('transitionend', finish)
    panel.addEventListener('transitioncancel', finish)

    return finish
  }, [collapsed])

  const expand = useCallback(() => {
    if (useScanToggleStore.getState().collapsed) toggle()
  }, [toggle])

  return { collapsed, toggle, expand, panelRef, shellRef, height }
}
