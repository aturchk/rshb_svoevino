<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
const restoreFocusTo = ref<HTMLElement | null>(null)
const savedScrollY = ref(0)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Блокировка фона фиксацией, а не overflow: hidden.
 * На iOS Safari overflow: hidden на body не останавливает скролл, а при закрытии
 * страница прыгает в начало. Фиксация с компенсацией top сохраняет позицию.
 */
function lockScroll() {
  savedScrollY.value = window.scrollY
  document.body.style.position = 'fixed'
  document.body.style.top = `-${savedScrollY.value}px`
  document.body.style.insetInline = '0'
}

function unlockScroll() {
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.insetInline = ''
  window.scrollTo({ top: savedScrollY.value, behavior: 'instant' })
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
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

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      restoreFocusTo.value = document.activeElement as HTMLElement | null
      lockScroll()
      document.addEventListener('keydown', onKeyDown)
      await nextTick()
      panel.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else {
      document.removeEventListener('keydown', onKeyDown)
      unlockScroll()
      restoreFocusTo.value?.focus()
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (props.open) unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="overlay" aria-hidden="true" @click="emit('close')" />
      <div ref="panel" class="panel" role="dialog" aria-modal="true" :aria-label="title">
        <div class="header">
          <h2 class="title">{{ title }}</h2>
          <button type="button" class="close" aria-label="Закрыть фильтры" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
        <div class="body"><slot /></div>
        <div v-if="$slots.footer" class="footer"><slot name="footer" /></div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background-color: rgb(44 42 40 / 45%);
  animation: fade var(--transition-base);
}

.panel {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 51;
  display: flex;
  flex-direction: column;
  max-height: 88dvh;
  background-color: var(--color-bg);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  animation: rise var(--transition-slow);
  overscroll-behavior: contain;
  contain: layout paint;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.title {
  font-size: 22px;
}

.close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -10px -10px -10px 0;
  border-radius: 999px;
  color: var(--color-text-secondary);
}

.body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-5);
}

.footer {
  padding: var(--space-4) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay,
  .panel {
    animation: none;
  }
}
</style>
