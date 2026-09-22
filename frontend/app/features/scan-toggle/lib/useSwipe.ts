import { ref } from 'vue'

/**
 * Вертикальный свайп.
 *
 * Pointer Events, а не Touch: один код на палец, мышь и стилус, плюс
 * setPointerCapture доводит жест до конца, когда палец ушёл за границу
 * элемента — при смахивании вверх это происходит почти всегда.
 */

/** До этого порога жест не начинаем: пальцы дрожат при обычном тапе. */
const DEAD_ZONE = 8
/** Пока не накоплено столько по любой оси, направление не определяем. */
const AXIS_LOCK = 10
/**
 * Флик засчитываем раньше по расстоянию, но обязательно с минимальной
 * дистанцией: иначе движение на 5 px за 10 мс даёт скорость 0.5 и срабатывает,
 * то есть любой быстрый тап со смазом выполняет жест.
 */
const COMMIT_VELOCITY = 0.5
const MIN_FLICK_DISTANCE = 24
/** Доля высоты элемента, после которой жест считается совершённым. */
const COMMIT_RATIO = 0.3

type Direction = 'up' | 'down'

interface Origin {
  x: number
  y: number
  time: number
  id: number
  axis: 'unknown' | 'vertical' | 'foreign'
}

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [role="switch"]'

export function useSwipe(
  direction: Direction,
  onSwipe: () => void,
  options: { enabled: () => boolean; distance: () => number },
) {
  const origin = ref<Origin | null>(null)
  const fired = ref(false)

  function release(target: HTMLElement, pointerId: number) {
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    } catch {
      // Указатель мог быть потерян вместе с элементом — это не ошибка.
    }
  }

  function finish(event?: PointerEvent) {
    if (event) release(event.currentTarget as HTMLElement, event.pointerId)
    origin.value = null
    fired.value = false
  }

  function onPointerDown(event: PointerEvent) {
    if (!options.enabled() || !event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Тап по кнопке внутри области жеста не должен превращаться в свайп:
    // с камерой внутри панели живут «Включить камеру» и «Попробовать снова».
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return

    origin.value = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      id: event.pointerId,
      axis: 'unknown',
    }
    fired.value = false
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    const start = origin.value
    if (!start || fired.value || start.id !== event.pointerId) return

    const deltaX = event.clientX - start.x
    const rawY = direction === 'up' ? start.y - event.clientY : event.clientY - start.y

    if (start.axis === 'unknown') {
      if (Math.abs(deltaX) < AXIS_LOCK && Math.abs(rawY) < AXIS_LOCK) return
      start.axis = Math.abs(deltaX) > Math.abs(rawY) ? 'foreign' : 'vertical'
    }
    if (start.axis === 'foreign') {
      finish(event)
      return
    }
    if (rawY <= DEAD_ZONE) return

    const elapsed = Math.max(event.timeStamp - start.time, 1)
    const velocity = rawY / elapsed
    const commitDistance = Math.max(options.distance() * COMMIT_RATIO, MIN_FLICK_DISTANCE)

    if (rawY >= commitDistance || (velocity >= COMMIT_VELOCITY && rawY >= MIN_FLICK_DISTANCE)) {
      // Срабатываем по достижении порога, не дожидаясь отпускания: так отзывчивее.
      fired.value = true
      onSwipe()
      finish(event)
    }
  }

  return {
    onPointerdown: onPointerDown,
    onPointermove: onPointerMove,
    onPointerup: finish,
    onPointercancel: finish,
    onLostpointercapture: () => finish(),
  }
}
