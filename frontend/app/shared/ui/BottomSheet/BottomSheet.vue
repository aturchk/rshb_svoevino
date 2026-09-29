<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useFocusTrap } from '../../lib/useFocusTrap'
import { lockScroll, unlockScroll } from '../../lib/useScrollLock'
import Icon from '../Icon/Icon.vue'

export type SheetSnap = 'peek' | 'full'

/**
 * Шторка с двумя положениями, как на vino-svoe.ru (там 50% и 100%):
 * «peek» — превью результата, «full» — вся карточка. Тянется пальцем.
 *
 * Анимируется только transform: панель всегда полной высоты и сдвигается вниз,
 * поэтому ни layout, ни перерисовка содержимого во время жеста не происходят.
 *
 * Жест: в положении peek тянуть можно за любое место, в full — за шапку
 * (тело шторки прокручивается, и браузер сам отдаёт вертикаль скроллу).
 * Жест — не единственный способ: у ручки есть кнопка, у шторки — «Закрыть» и Escape.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    /** Подпись диалога для скринридера */
    label: string
    snap?: SheetSnap
    /** Доля высоты экрана в положении peek */
    peek?: number
  }>(),
  { snap: 'peek', peek: 0.68 },
)

const emit = defineEmits<{ close: []; 'update:snap': [snap: SheetSnap] }>()

const DURATION = 380
const DEAD_ZONE = 6
/** Прогноз положения через столько мс по текущей скорости — так флик доезжает сам. */
const PROJECTION_MS = 160
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="switch"]'

const rendered = ref(false)
const panel = ref<HTMLElement | null>(null)
const handle = ref<HTMLButtonElement | null>(null)
const offset = ref(0)
const height = ref(0)
const dragging = ref(false)
const settling = ref(false)
const current = ref<SheetSnap>(props.snap)
/** Шторка уезжает: смена положения в этот момент не должна отменить закрытие. */
const closing = ref(false)

const trap = useFocusTrap(panel, () => emit('close'))

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function peekOffset(): number {
  return Math.max(0, height.value - Math.round(window.innerHeight * props.peek))
}

function offsetFor(target: SheetSnap | 'closed'): number {
  if (target === 'closed') return height.value
  return target === 'full' ? 0 : peekOffset()
}

function measure() {
  height.value = panel.value?.offsetHeight ?? window.innerHeight
}

let settleTimer = 0
function settle(target: SheetSnap | 'closed', done?: () => void) {
  window.clearTimeout(settleTimer)
  settling.value = !reducedMotion()
  offset.value = offsetFor(target)
  settleTimer = window.setTimeout(
    () => {
      settling.value = false
      done?.()
    },
    settling.value ? DURATION : 0,
  )
}

function onResize() {
  if (!rendered.value || dragging.value) return
  measure()
  offset.value = offsetFor(current.value)
}

async function show() {
  closing.value = false
  rendered.value = true
  current.value = props.snap
  lockScroll()
  window.addEventListener('resize', onResize)
  await nextTick()
  measure()
  // Кадр 0 — за краем экрана без перехода, со следующего — въезд.
  offset.value = height.value
  requestAnimationFrame(() => requestAnimationFrame(() => settle(current.value)))
  trap.activate(handle.value)
}

function hide() {
  closing.value = true
  window.removeEventListener('resize', onResize)
  trap.deactivate()
  settle('closed', () => {
    rendered.value = false
    closing.value = false
    unlockScroll()
  })
}

watch(
  () => props.open,
  (open) => {
    if (!import.meta.client) return
    if (open) void show()
    else if (rendered.value) hide()
  },
  { immediate: true },
)

watch(
  () => props.snap,
  (snap) => {
    if (!rendered.value || closing.value || snap === current.value) return
    current.value = snap
    settle(snap)
  },
)

function go(target: SheetSnap) {
  if (closing.value) return
  current.value = target
  settle(target)
  emit('update:snap', target)
}

function toggle() {
  go(current.value === 'full' ? 'peek' : 'full')
}

onBeforeUnmount(() => {
  window.clearTimeout(settleTimer)
  window.removeEventListener('resize', onResize)
  if (rendered.value) {
    trap.deactivate()
    unlockScroll()
  }
})

/* ——— Жест ——— */

interface Drag {
  id: number
  startY: number
  startOffset: number
  lastY: number
  lastTime: number
  velocity: number
  active: boolean
  target: HTMLElement
}
let drag: Drag | null = null

function onPointerDown(event: PointerEvent, zone: 'handle' | 'body') {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
  if (zone === 'body' && current.value === 'full') return
  // Тап по кнопке остаётся тапом; жест от кнопки начинается только в зоне ручки.
  if (zone === 'body' && (event.target as HTMLElement).closest(INTERACTIVE)) return
  drag = {
    id: event.pointerId,
    startY: event.clientY,
    startOffset: offset.value,
    lastY: event.clientY,
    lastTime: event.timeStamp,
    velocity: 0,
    active: false,
    target: event.currentTarget as HTMLElement,
  }
}

function onPointerMove(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  const delta = event.clientY - drag.startY
  if (!drag.active) {
    if (Math.abs(delta) < DEAD_ZONE) return
    drag.active = true
    dragging.value = true
    settling.value = false
    // Захват — только когда жест точно начался: иначе клик по кнопке потеряется.
    drag.target.setPointerCapture(event.pointerId)
  }
  const elapsed = Math.max(event.timeStamp - drag.lastTime, 1)
  drag.velocity = 0.7 * ((event.clientY - drag.lastY) / elapsed) + 0.3 * drag.velocity
  drag.lastY = event.clientY
  drag.lastTime = event.timeStamp

  const next = drag.startOffset + delta
  // Выше полного положения — с сопротивлением, как у нативных шторок.
  offset.value = next < 0 ? next / 4 : Math.min(next, height.value)
}

function onPointerUp(event: PointerEvent) {
  if (!drag || drag.id !== event.pointerId) return
  const { active, velocity, target } = drag
  drag = null
  if (!active) return
  try {
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  } catch {
    // Элемент могли размонтировать посреди жеста.
  }
  dragging.value = false

  const projected = offset.value + velocity * PROJECTION_MS
  const peek = peekOffset()
  const closeLine = (peek + height.value) / 2
  if (projected > closeLine) {
    emit('close')
  } else if (projected < peek / 2) {
    go('full')
  } else {
    go('peek')
  }
}

function onPointerCancel() {
  if (!drag) return
  const wasActive = drag.active
  drag = null
  dragging.value = false
  if (wasActive) settle(current.value)
}

const panelStyle = computed(() => ({
  transform: `translate3d(0, ${offset.value}px, 0)`,
  transition: settling.value ? `transform ${DURATION}ms var(--ease-out)` : 'none',
}))

const overlayStyle = computed(() => {
  const progress = height.value ? 1 - Math.min(Math.max(offset.value, 0) / height.value, 1) : 0
  return {
    opacity: String(Math.min(1, progress * 1.6)),
    transition: settling.value ? `opacity ${DURATION}ms var(--ease-out)` : 'none',
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="rendered" class="root">
      <div class="overlay" :style="overlayStyle" aria-hidden="true" @click="emit('close')" />
      <div
        ref="panel"
        class="panel"
        :class="{ full: current === 'full', dragging }"
        role="dialog"
        aria-modal="true"
        :aria-label="label"
        :style="panelStyle"
      >
        <div
          class="grip"
          @pointerdown="onPointerDown($event, 'handle')"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <button
            ref="handle"
            type="button"
            class="handle"
            :aria-label="current === 'full' ? 'Свернуть' : 'Развернуть полностью'"
            :aria-expanded="current === 'full'"
            @click="toggle"
          >
            <span class="bar" />
          </button>
          <button type="button" class="close" aria-label="Закрыть" @click="emit('close')">
            <Icon name="x" :size="22" />
          </button>
        </div>
        <div
          class="body"
          @pointerdown="onPointerDown($event, 'body')"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <slot :snap="current" :expand="() => go('full')" :collapse="() => go('peek')" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background-color: var(--color-overlay);
  opacity: 0;
}

.panel {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 61;
  display: flex;
  flex-direction: column;
  max-width: 640px;
  height: calc(100dvh - max(env(safe-area-inset-top), 12px) - 8px);
  margin-inline: auto;
  background-color: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-sheet);
  contain: layout paint;
}

.dragging {
  will-change: transform;
}

.grip {
  position: relative;
  flex: none;
  display: flex;
  justify-content: center;
  /* Ручка целиком отдана жесту шторки. */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.handle {
  display: grid;
  place-items: center;
  width: 100%;
  height: 44px;
  cursor: grab;
}

.bar {
  width: 40px;
  height: 5px;
  border-radius: var(--radius-pill);
  background-color: var(--color-border-strong);
}

.close {
  position: absolute;
  top: 6px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  color: var(--color-text-secondary);
  transition: background-color var(--transition-fast);
}

.close:hover {
  background-color: var(--color-accent-tint);
}

.body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom));
  /* В peek вертикаль — жест шторки, горизонталь — ленты внутри. */
  touch-action: pan-x;
  overscroll-behavior: contain;
}

.full .body {
  overflow-y: auto;
  touch-action: pan-x pan-y;
}

@media (width <= 574px) {
  .body {
    padding-inline: var(--space-4);
  }
}
</style>
