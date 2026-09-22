import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Смахивание вверх, сворачивающее панель сканера.
 *
 * Pointer Events, а не Touch: один код на палец, мышь и стилус, плюс
 * setPointerCapture сам доводит жест до конца, даже если палец ушёл за
 * границы элемента.
 *
 * Срабатывание по расстоянию ИЛИ по скорости: короткий резкий флик ощущается
 * как свайп, хотя пальцем пройдено всего пара десятков пикселей.
 */

/** Ниже этого по вертикали — ещё не жест, а дрожание пальца при тапе. */
const MIN_DISTANCE = 48
/** Резкий флик засчитываем раньше: px в миллисекунду. */
const MIN_VELOCITY = 0.35
/** Горизонтальное движение длиннее вертикального — это не наш жест. */
const DIRECTION_RATIO = 1.2

interface SwipeHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

type Direction = 'up' | 'down'

function useSwipe(direction: Direction, onSwipe: () => void, enabled: boolean): SwipeHandlers {
  const start = useRef<{ x: number; y: number; time: number; id: number } | null>(null)
  const fired = useRef(false)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !event.isPrimary) return
      start.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId }
      fired.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [enabled],
  )

  const finish = useCallback(() => {
    start.current = null
    fired.current = false
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = start.current
      if (!origin || fired.current || origin.id !== event.pointerId) return

      const deltaX = event.clientX - origin.x
      // Приводим к «в нужную сторону — положительное», чтобы пороги были общими.
      const deltaY =
        direction === 'up' ? origin.y - event.clientY : event.clientY - origin.y
      if (Math.abs(deltaX) > Math.abs(deltaY) * DIRECTION_RATIO) {
        // Пользователь ведёт вбок — это не сворачивание, отпускаем жест.
        finish()
        return
      }
      if (deltaY <= 0) return

      const elapsed = Math.max(event.timeStamp - origin.time, 1)
      const velocity = deltaY / elapsed
      if (deltaY >= MIN_DISTANCE || velocity >= MIN_VELOCITY) {
        // Срабатываем сразу по достижении порога, не дожидаясь отпускания:
        // так жест ощущается отзывчивее.
        fired.current = true
        onSwipe()
      }
    },
    [direction, finish, onSwipe],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finish()
    },
    [finish],
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }
}

/** Смахивание вверх: сворачивает панель сканера. */
export function useSwipeUp(onSwipe: () => void, enabled = true): SwipeHandlers {
  return useSwipe('up', onSwipe, enabled)
}

/**
 * Смахивание вниз: разворачивает свёрнутую панель.
 * Вешается на шапку — свёрнутая панель не видна, тянуть её неоткуда.
 */
export function useSwipeDown(onSwipe: () => void, enabled = true): SwipeHandlers {
  return useSwipe('down', onSwipe, enabled)
}
