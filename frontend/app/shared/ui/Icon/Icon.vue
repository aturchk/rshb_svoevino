<script setup lang="ts">
import { computed } from 'vue'

import type { IconName } from './icons'
import { ICONS } from './icons'

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number
    /** Толщина линии: у Lucide по умолчанию 2, как на сайте. */
    stroke?: number
    /** Подпись для скринридера. Без неё иконка декоративная и скрыта от него. */
    label?: string
  }>(),
  { size: 24, stroke: 2, label: undefined },
)

const markup = computed(() => ICONS[props.name])
</script>

<template>
  <!-- Разметка иконок статична и лежит в коде (icons.ts), пользовательских данных в ней нет. -->
  <!-- eslint-disable vue/no-v-html -->
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
    v-html="markup"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
