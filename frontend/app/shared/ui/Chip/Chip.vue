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
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  max-width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background-color: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 20px;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.chip:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.checked {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.checked:hover {
  background-color: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.chip:disabled {
  opacity: 0.4;
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
}

.checked .count {
  color: rgb(255 255 255 / 75%);
}
</style>
