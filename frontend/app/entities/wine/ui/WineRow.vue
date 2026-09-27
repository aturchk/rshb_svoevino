<script setup lang="ts">
import { NuxtLink } from '#components'

import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'

import { formatAbv, wineKind } from '../lib/format'
import type { WineSummary } from '../model/types'

defineProps<{
  wine: WineSummary
  /** Ссылка на карточку; без неё строка — кнопка, и клик ловит родитель. */
  to?: string
  note?: string
}>()

defineEmits<{ select: [] }>()
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="row"
    @click="!to && $emit('select')"
  >
    <span class="thumb">
      <BottleImage
        :src="wine.image?.src ?? null"
        :width="wine.image?.width ?? 0"
        :height="wine.image?.height ?? 0"
        :alt="wine.name"
        :category="wine.category"
        :box-width="20"
      />
    </span>
    <span class="text">
      <span class="name">{{ wine.name }}</span>
      <span class="meta">
        {{ wine.winery }} · {{ wineKind(wine)
        }}<template v-if="wine.abv !== null"> · {{ formatAbv(wine.abv) }}</template>
      </span>
      <span v-if="note" class="note">{{ note }}</span>
    </span>
    <Icon name="chevron-right" :size="20" class="chevron" />
  </component>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 72px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-cream);
  color: var(--color-text);
  text-align: left;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--transition-base),
    background-color 0.3s ease-in;
}

.row:active {
  transform: scale(var(--press-scale));
}

.thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 64px;
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.meta {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.note {
  color: var(--color-accent);
  font-size: 13px;
  line-height: 18px;
}

.chevron {
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .row:active {
    transform: none;
  }
}
</style>
