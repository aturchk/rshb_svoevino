<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  min: number
  max: number
  step: number
  from: number
  to: number
  label: string
  format: (value: number) => string
}>()

const emit = defineEmits<{ change: [from: number, to: number]; commit: [] }>()

const span = computed(() => props.max - props.min || 1)
const leftPercent = computed(() => ((props.from - props.min) / span.value) * 100)
const rightPercent = computed(() => ((props.to - props.min) / span.value) * 100)

function onFrom(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('change', Math.min(value, props.to), props.to)
}

function onTo(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  emit('change', props.from, Math.max(value, props.from))
}
</script>

<template>
  <div class="root">
    <div class="values">
      <span class="current">{{ format(from) }}</span>
      <span class="current">{{ format(to) }}</span>
    </div>
    <div class="track">
      <span class="rail" />
      <span class="fill" :style="{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }" />
      <!-- Два нативных input[type=range]: стрелки, Home/End и поддержка
           скринридеров достаются бесплатно. -->
      <input
        type="range"
        class="input"
        :aria-label="`${label}: минимум`"
        :min="min"
        :max="max"
        :step="step"
        :value="from"
        @input="onFrom"
        @pointerup="emit('commit')"
        @keyup="emit('commit')"
      />
      <input
        type="range"
        class="input"
        :aria-label="`${label}: максимум`"
        :min="min"
        :max="max"
        :step="step"
        :value="to"
        @input="onTo"
        @pointerup="emit('commit')"
        @keyup="emit('commit')"
      />
    </div>
  </div>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.values {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

.current {
  color: var(--color-text);
  font-weight: 600;
}

.track {
  position: relative;
  /* Полоса во всю цель нажатия: ползунки 20px пальцем не разводятся. */
  height: 44px;
}

.rail,
.fill {
  position: absolute;
  top: 21px;
  height: 2px;
  border-radius: 2px;
}

.rail {
  inset-inline: 0;
  background-color: var(--color-border-strong);
}

.fill {
  background-color: var(--color-accent);
}

.input {
  position: absolute;
  inset-inline: 0;
  top: 0;
  width: 100%;
  height: 44px;
  margin: 0;
  background: none;
  appearance: none;
  pointer-events: none;
  touch-action: none;
}

.input::-webkit-slider-thumb {
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-accent);
  background-color: #fff;
  pointer-events: auto;
  cursor: grab;
}

.input::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--color-accent);
  background-color: #fff;
  pointer-events: auto;
  cursor: grab;
}

.input:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .input::-webkit-slider-thumb {
    width: 28px;
    height: 28px;
  }

  .input::-moz-range-thumb {
    width: 28px;
    height: 28px;
  }
}
</style>
