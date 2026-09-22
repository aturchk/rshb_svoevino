<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', block: false, disabled: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="['button', variant, size, { block }]"
  >
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  /* 44px — минимальная цель нажатия пальцем. */
  min-height: 44px;
  border-radius: 999px;
  font-weight: 500;
  text-align: center;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
}

.button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.primary {
  background-color: var(--color-accent);
  color: #fff;
}

.primary:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
}

.primary:active:not(:disabled) {
  background-color: var(--color-accent-active);
}

.secondary {
  background-color: transparent;
  color: var(--color-accent);
  border: 1px solid var(--color-border-strong);
}

.secondary:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.ghost {
  background-color: transparent;
  color: var(--color-text-secondary);
}

.ghost:hover:not(:disabled) {
  color: var(--color-accent);
}

.sm {
  padding: 10px 16px;
  font-size: 14px;
  line-height: 20px;
}

.md {
  padding: 12px 24px;
  font-size: 16px;
  line-height: 24px;
}

.lg {
  min-height: 56px;
  padding: 16px 32px;
  font-size: 17px;
  line-height: 24px;
}

.block {
  width: 100%;
}
</style>
