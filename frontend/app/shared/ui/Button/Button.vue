<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'elevated'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
    /** Если задан — кнопка становится ссылкой, но выглядит так же. */
    to?: string
  }>(),
  { variant: 'primary', size: 'md', block: false, disabled: false, type: 'button', to: undefined },
)

const classes = computed(() => ['button', props.variant, props.size, { block: props.block }])
</script>

<template>
  <NuxtLink v-if="to && !disabled" :to="to" :class="classes">
    <slot />
  </NuxtLink>
  <button v-else :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>

<style scoped>
/*
 * Кнопки как на vino-svoe.ru: прямоугольные (M — 44 px и радиус 12, L — 56 px
 * и радиус 16), вес 600, нажатие — scale(.98). Таблетки на сайте только у круглых
 * иконок, поэтому здесь их нет.
 */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  /* 44px — минимальная цель нажатия пальцем. */
  min-height: 44px;
  border: none;
  border-radius: var(--radius-button);
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.3s ease-in,
    color 0.3s ease-in,
    opacity 0.3s ease-in,
    transform var(--transition-base);
}

.button:active:not(:disabled) {
  transform: scale(var(--press-scale));
}

.button:disabled {
  opacity: 0.3;
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
  background-color: var(--color-accent-tint);
  color: var(--color-accent);
}

.secondary:hover:not(:disabled) {
  background-color: var(--color-accent-tint-hover);
}

.secondary:active:not(:disabled) {
  background-color: var(--color-accent-tint-active);
}

.ghost {
  background-color: transparent;
  color: var(--color-accent);
}

.ghost:hover:not(:disabled) {
  background-color: var(--color-accent-tint);
}

.ghost:active:not(:disabled) {
  background-color: var(--color-accent-tint-hover);
}

.elevated {
  background-color: #fff;
  color: var(--color-accent);
  box-shadow: var(--shadow-elevated);
}

.elevated:active:not(:disabled) {
  background-color: #fafafb;
}

.sm {
  padding: 10px 14px;
  font-size: 14px;
  line-height: 20px;
}

.md {
  padding: 12px 20px;
  font-size: 16px;
  line-height: 20px;
}

.lg {
  min-height: 56px;
  padding: 16px 24px;
  border-radius: var(--radius-md);
  font-size: 16px;
  line-height: 20px;
}

.block {
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .button:active:not(:disabled) {
    transform: none;
  }
}
</style>
