<script setup lang="ts">
import type { ScanHistoryItem } from '@/entities/scan'
import { wineRoute } from '@/shared/config/routes'

defineProps<{ items: ScanHistoryItem[]; isDemo: boolean; browseTo: string }>()

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})
</script>

<template>
  <div v-if="items.length === 0" class="empty">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
        stroke="var(--color-accent)"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
    <h2 class="emptyTitle">Вы ещё ничего не сканировали</h2>
    <p class="emptyText">
      Отсканированные бутылки появятся здесь, чтобы к ним можно было вернуться.
    </p>
    <NuxtLink :to="browseTo" class="browse">Открыть каталог</NuxtLink>
  </div>

  <template v-else>
    <p v-if="isDemo" class="demoNote">
      Это демонстрационные записи для проверки вёрстки — настоящих сканирований пока нет.
    </p>
    <ul class="list">
      <li v-for="item in items" :key="item.id" class="item">
        <div class="body">
          <NuxtLink
            v-if="item.wineSlug && item.wineName"
            :to="wineRoute(item.wineSlug)"
            class="itemTitle"
          >
            {{ item.wineName }}
          </NuxtLink>
          <span v-else class="itemTitle">Вино не найдено в каталоге</span>
          <div class="meta">
            {{ dateFormatter.format(new Date(item.scannedAt)) }}
            <template v-if="item.confidence !== null">
              · уверенность {{ Math.round(item.confidence * 100) }}%
            </template>
          </div>
        </div>
        <span class="badge" :class="item.status === 'matched' ? 'matched' : 'missing'">
          {{ item.status === 'matched' ? 'Найдено' : 'Не найдено' }}
        </span>
      </li>
    </ul>
  </template>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-7) var(--space-5);
  text-align: center;
  background-color: var(--color-surface-cream);
  border-radius: var(--radius-lg);
}

.emptyTitle {
  font-size: 21px;
}

.emptyText {
  max-width: 40ch;
  color: var(--color-text-secondary);
}

.browse {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-5);
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  color: var(--color-accent);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.body {
  flex: 1;
  min-width: 0;
}

.itemTitle {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.meta {
  color: var(--color-text-muted);
  font-size: 14px;
}

.badge {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.matched {
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
}

.missing {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
}

.demoNote {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 14px;
}
</style>
