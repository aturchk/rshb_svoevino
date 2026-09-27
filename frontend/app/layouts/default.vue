<script setup lang="ts">
import { computed } from 'vue'

import { TabBar } from '@/widgets/TabBar'
import TopNav from '@/widgets/TabBar/TopNav.vue'

const route = useRoute()
const fullHeight = computed(() => route.meta.fullHeight === true)
</script>

<template>
  <div class="shell">
    <a class="skip" href="#main">Перейти к содержимому</a>
    <TopNav />
    <main id="main" class="content" :class="{ fullHeight }">
      <slot />
    </main>
    <TabBar />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.skip {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  z-index: 100;
  padding: 10px 18px;
  border-radius: var(--radius-button);
  background-color: var(--color-accent);
  color: #fff;
  transition: top var(--transition-fast);
}

.skip:focus {
  top: var(--space-2);
}

.content {
  flex: 1;
  max-width: var(--container-max);
  width: 100%;
  margin: 0 auto;
  padding-inline: calc(var(--container-pad) + env(safe-area-inset-left))
    calc(var(--container-pad) + env(safe-area-inset-right));
  /* Нижний таб-бар перекрывает контент — компенсируем его высотой и безопасной зоной. */
  padding-bottom: calc(var(--space-7) + var(--tabbar-h) + env(safe-area-inset-bottom));
}

/* Экран сканера: ровно между шапкой и таб-баром, без прокрутки. */
.content.fullHeight {
  flex: none;
  height: calc(100dvh - var(--header-h) - var(--tabbar-h) - env(safe-area-inset-bottom));
  padding-bottom: 0;
  overflow: hidden;
}

@media (width >= 1023px) {
  .content {
    padding-bottom: var(--space-7);
  }

  .content.fullHeight {
    height: calc(100dvh - var(--header-h));
    padding-bottom: var(--space-5);
  }
}
</style>
