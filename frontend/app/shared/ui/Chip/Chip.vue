<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  count?: number
  checked: boolean
}>()

defineEmits<{ toggle: [] }>()

/** Значение, которого нет в текущей выдаче, гасим, но не прячем:
    если скрыть, панель фильтров прыгает под пальцем. */
const disabled = computed(() => !props.checked && props.count === 0)
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :disabled="disabled"
    :class="['chip', { checked }]"
    @click="$emit('toggle')"
  >
    <span class="label">{{ label }}</span>
    <span v-if="count !== undefined" class="count">{{ count }}</span>
  </button>
</template>

<style scoped>
/*
 * Чип сайта: текст бордовый 14/20 вес 600, рамка #d7d4d2, выбранный — заливка.
 * Высота 44, а не 32 как на сайте: чипы здесь нажимают пальцем у полки.
 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  max-width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background-color: transparent;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.3s ease-in,
    border-color 0.3s ease-in,
    color 0.3s ease-in,
    transform var(--transition-base);
}

.chip:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.chip:active:not(:disabled) {
  background-color: var(--color-accent-tint);
  transform: scale(var(--press-scale));
}

.checked {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.checked:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.checked:active:not(:disabled) {
  background-color: var(--color-accent-active);
}

.chip:disabled {
  color: var(--color-text-faint);
  cursor: not-allowed;
}

/* Длинные названия виноделен не должны распирать чип за край экрана. */
.label {
  overflow-wrap: anywhere;
}

.count {
  flex: none;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 500;
}

.checked .count {
  color: rgb(255 255 255 / 80%);
}

@media (prefers-reduced-motion: reduce) {
  .chip:active:not(:disabled) {
    transform: none;
  }
}
</style>
