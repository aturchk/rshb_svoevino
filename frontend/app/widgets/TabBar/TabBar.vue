<script setup lang="ts">
import { ROUTES } from '@/shared/config/routes'
</script>

<template>
  <nav class="tabbar" aria-label="Разделы">
    <NuxtLink :to="ROUTES.catalog" class="item">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
      <span>Каталог</span>
    </NuxtLink>

    <!-- Главное действие продукта — в центре нижнего ряда, самой досягаемой
         точке экрана для большого пальца. -->
    <NuxtLink :to="ROUTES.scan" class="item scan">
      <span class="circle">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <span>Сканер</span>
    </NuxtLink>

    <NuxtLink :to="ROUTES.history" class="item">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>История</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  background-color: var(--color-bg);
  border-top: 1px solid var(--color-border);
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
}

.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: var(--tabbar-h);
  padding: 8px 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 14px;
}

.item.router-link-active {
  color: var(--color-accent);
  font-weight: 600;
}

.scan {
  /* Приподнятый центр: сканер визуально выше остальных пунктов. */
  margin-top: -18px;
  justify-content: flex-start;
  gap: 5px;
}

.circle {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background-color: var(--color-accent);
  color: #fff;
  border: 4px solid var(--color-bg);
  transition: background-color var(--transition-fast);
}

.scan:hover .circle {
  background-color: var(--color-accent-hover);
}

.scan.router-link-active .circle {
  background-color: var(--color-accent-active);
}

@media (width >= 1023px) {
  .tabbar {
    display: none;
  }
}
</style>
