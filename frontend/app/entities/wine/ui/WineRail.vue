<script setup lang="ts">
import { wineRoute } from '@/shared/config/routes'
import Skeleton from '@/shared/ui/Skeleton/Skeleton.vue'

import type { SimilarWine } from '../model/types'
import WineTile from './WineTile.vue'

withDefaults(
  defineProps<{
    wines: SimilarWine[]
    title?: string
    subtitle?: string
    pending?: boolean
    headingLevel?: 2 | 3
  }>(),
  {
    title: 'Похожие вина',
    subtitle: 'Аналоги от других виноделен',
    pending: false,
    headingLevel: 2,
  },
)
</script>

<template>
  <section class="similar" :aria-busy="pending">
    <div class="head">
      <component :is="`h${headingLevel}`" class="title">{{ title }}</component>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </div>
    <ul v-if="pending" class="rail" aria-hidden="true">
      <li v-for="n in 3" :key="n" class="item">
        <Skeleton height="252px" radius="var(--radius-card)" />
      </li>
    </ul>
    <ul v-else-if="wines.length" class="rail">
      <li
        v-for="(wine, position) in wines"
        :key="wine.slug"
        class="item"
        :style="{ '--i': position }"
      >
        <WineTile :wine="wine" :to="wineRoute(wine.slug)" :reason="wine.reasons[0]" />
      </li>
    </ul>
    <p v-else class="empty">Похожих вин в каталоге не нашлось.</p>
  </section>
</template>

<style scoped>
.head {
  margin-bottom: var(--space-4);
}

.title {
  font-size: 24px;
}

.subtitle {
  margin-top: var(--space-1);
  color: var(--color-text-secondary);
  font-size: 14px;
}

/* Лента на всю ширину экрана: край карточки уходит за экран и подсказывает прокрутку. */
.rail {
  --bleed: var(--rail-bleed, var(--container-pad));

  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 156px;
  gap: var(--space-3);
  margin-inline: calc(var(--bleed) * -1);
  padding-inline: var(--bleed);
  padding-bottom: var(--space-2);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: var(--bleed);
  scrollbar-width: none;
}

.rail::-webkit-scrollbar {
  display: none;
}

.item {
  scroll-snap-align: start;
  animation: rise 0.4s var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 60ms);
}

.empty {
  color: var(--color-text-secondary);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@media (width >= 767px) {
  .rail {
    grid-auto-columns: 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .item {
    animation: none;
  }
}
</style>
