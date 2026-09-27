<script setup lang="ts">
import { NuxtLink } from '#components'

import type { RecognizeStatus, ScanHistoryItem } from '@/entities/scan'
import { wineRoute } from '@/shared/config/routes'
import Button from '@/shared/ui/Button/Button.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'

defineProps<{ items: ScanHistoryItem[]; isDemo: boolean; scanTo: string; browseTo: string }>()
defineEmits<{ remove: [id: string] }>()

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

const BADGE: Record<RecognizeStatus, string> = {
  matched: 'Найдено',
  low_confidence: 'Не уверены',
  not_found: 'Не найдено',
}
</script>

<template>
  <div v-if="items.length === 0" class="empty">
    <span class="emptyIcon"><Icon name="scan" :size="32" /></span>
    <h2 class="emptyTitle">Вы ещё ничего не сканировали</h2>
    <p class="emptyText">
      Отсканированные бутылки появятся здесь — со снимком, чтобы к ним было легко вернуться.
    </p>
    <div class="emptyActions">
      <Button size="lg" block :to="scanTo">
        <Icon name="camera" :size="20" />
        Сканировать этикетку
      </Button>
      <Button variant="ghost" block :to="browseTo">Открыть каталог</Button>
    </div>
  </div>

  <template v-else>
    <p v-if="isDemo" class="demoNote">
      Среди записей есть демонстрационные — для проверки вёрстки. Они помечены «Демо».
    </p>
    <ul class="list">
      <li
        v-for="(item, position) in items"
        :key="item.id"
        class="item"
        :style="{ '--i': position }"
      >
        <component
          :is="item.wineSlug ? NuxtLink : 'div'"
          :to="item.wineSlug ? wineRoute(item.wineSlug) : undefined"
          class="link"
        >
          <span class="thumb">
            <img
              v-if="item.thumbnailDataUrl"
              :src="item.thumbnailDataUrl"
              alt=""
              width="56"
              height="72"
              loading="lazy"
            />
            <Icon v-else name="wine" :size="24" />
          </span>
          <span class="body">
            <span class="title">{{ item.wineName ?? 'Вино не найдено в каталоге' }}</span>
            <span class="meta">
              <template v-if="item.winery">{{ item.winery }} · </template>
              {{ dateFormatter.format(new Date(item.scannedAt)) }}
            </span>
            <span class="badges">
              <span class="badge" :class="item.status">{{ BADGE[item.status] }}</span>
              <span v-if="item.confirmed" class="badge plain">Выбрано вами</span>
              <span v-if="item.demo" class="badge demo">Демо</span>
            </span>
          </span>
          <Icon v-if="item.wineSlug" name="chevron-right" :size="20" class="chevron" />
        </component>
        <button
          type="button"
          class="remove"
          :aria-label="`Удалить из истории: ${item.wineName ?? 'скан без результата'}`"
          @click="$emit('remove', item.id)"
        >
          <Icon name="x" :size="18" />
        </button>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
  text-align: center;
  background-color: var(--color-surface-cream);
  border-radius: var(--radius-lg);
}

.emptyIcon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  box-shadow: var(--shadow-gold);
}

.emptyTitle {
  font-size: 22px;
}

.emptyText {
  max-width: 36ch;
  color: var(--color-text-secondary);
}

.emptyActions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: min(100%, 320px);
  margin-top: var(--space-2);
}

.demoNote {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item {
  position: relative;
  animation: rise 0.35s var(--ease-out) both;
  animation-delay: calc(min(var(--i, 0), 8) * 40ms);
}

.link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 88px;
  padding: var(--space-2) 52px var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-cream);
  color: var(--color-text);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--transition-base);
}

a.link:active {
  transform: scale(var(--press-scale));
}

.thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 72px;
  overflow: hidden;
  border-radius: 12px;
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-weight: 600;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.meta {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.badge {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.matched {
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
}

.low_confidence,
.not_found,
.plain {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
}

.demo {
  background-color: var(--color-accent-tint);
  color: var(--color-accent);
}

.chevron {
  color: var(--color-text-muted);
}

.remove {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transform: translateY(-50%);
}

.remove:hover {
  background-color: var(--color-accent-tint);
  color: var(--color-accent);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .item {
    animation: none;
  }
}
</style>
