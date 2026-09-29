<script setup lang="ts">
import { ROUTES } from '@/shared/config/routes'

const LINKS = [
  { to: ROUTES.catalog, label: 'Каталог' },
  { to: ROUTES.scan, label: 'Сканер' },
  { to: ROUTES.history, label: 'История' },
] as const
</script>

<template>
  <header class="header">
    <div class="inner">
      <NuxtLink :to="ROUTES.scan" class="logo">Своё <span>Вино</span></NuxtLink>
      <!-- На мобиле навигация живёт в нижнем таб-баре, здесь она дублировала бы его. -->
      <nav class="nav" aria-label="Разделы">
        <NuxtLink v-for="link in LINKS" :key="link.to" :to="link.to" class="link">
          {{ link.label }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 30;
  height: var(--header-h);
  background-color: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.inner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding-inline: calc(var(--container-pad) + env(safe-area-inset-left))
    calc(var(--container-pad) + env(safe-area-inset-right));
}

.logo {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.logo span {
  color: var(--color-accent);
}

.nav {
  display: none;
  gap: var(--space-2);
  margin-inline-start: auto;
}

.link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-4);
  border-radius: 999px;
  font-size: 15px;
  color: var(--color-text-secondary);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.link:hover {
  color: var(--color-accent);
}

.link.router-link-active {
  background-color: var(--color-surface-soft);
  color: var(--color-accent);
  font-weight: 500;
}

@media (width >= 1023px) {
  .nav {
    display: flex;
  }
}
</style>
