<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string; hint?: string }>()
const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <label class="wrapper" :for="id">
    <input :id="id" v-model="model" type="checkbox" class="input" />
    <span class="track"><span class="thumb" /></span>
    <span>
      {{ label }}
      <span v-if="hint" class="hint"> · {{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
.wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding-block: var(--space-2);
  margin-block: calc(var(--space-2) * -1);
  cursor: pointer;
  font-size: 15px;
  line-height: 22px;
}

.input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}

.track {
  flex: none;
  width: 44px;
  height: 26px;
  padding: 3px;
  border-radius: 999px;
  background-color: var(--color-border-strong);
  transition: background-color var(--transition-fast);
}

.thumb {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #fff;
  transition: transform var(--transition-fast);
}

.input:checked + .track {
  background-color: var(--color-accent);
}

.input:checked + .track .thumb {
  transform: translateX(18px);
}

.input:focus-visible + .track {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.hint {
  color: var(--color-text-muted);
  font-size: 13px;
}
</style>
