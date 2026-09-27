<script setup lang="ts">
import { computed } from 'vue'

import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'

import { wineKind } from '../lib/format'
import type { WineSummary } from '../model/types'

const props = defineProps<{
  wine: WineSummary
  to: string
  /** Почему это вино здесь: «Тот же сорт: Саперави». */
  reason?: string
}>()

/** Бутылки разной пропорции вписываются в одинаковую по высоте сцену. */
const STAGE_HEIGHT = 128
const boxWidth = computed(() => {
  const image = props.wine.image
  const ratio = image && image.width > 0 ? image.height / image.width : 3.56
  return Math.max(24, Math.min(72, Math.round(STAGE_HEIGHT / ratio)))
})
</script>

<template>
  <NuxtLink :to="to" class="tile">
    <span class="stage">
      <BottleImage
        :src="wine.image?.src ?? null"
        :width="wine.image?.width ?? 0"
        :height="wine.image?.height ?? 0"
        :alt="wine.name"
        :category="wine.category"
        :box-width="boxWidth"
      />
    </span>
    <span class="name">{{ wine.name }}</span>
    <span class="winery">{{ wine.winery }}</span>
    <span class="kind">{{ wineKind(wine) }}</span>
    <span v-if="reason" class="reason">{{ reason }}</span>
  </NuxtLink>
</template>

<style scoped>
/* Карточка «Похожие вина» сайта: кремовая заливка без тени и рамки, нажатие .975. */
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: var(--space-3) var(--space-3) var(--space-4);
  border-radius: var(--radius-card);
  background-color: var(--color-surface-cream);
  color: var(--color-text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.3s ease-out;
}

.tile:active {
  transform: scale(var(--press-scale-card));
}

.stage {
  display: grid;
  place-items: center;
  height: 140px;
  margin-bottom: var(--space-2);
}

.name {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.winery {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.kind {
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 18px;
}

.reason {
  align-self: flex-start;
  margin-top: auto;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

@media (hover: hover) {
  .tile:hover {
    transform: scale(1.025);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .tile:hover,
  .tile:active {
    transform: none;
  }
}
</style>
