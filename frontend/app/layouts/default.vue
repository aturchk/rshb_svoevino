<script setup lang="ts">
import { TabBar } from '@/widgets/TabBar'
import TopNav from '@/widgets/TabBar/TopNav.vue'
</script>

<template>
  <div class="shell">
    <a class="skip" href="#main">Перейти к содержимому</a>
    <TopNav />
    <main id="main" class="content">
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
  border-radius: 999px;
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

@media (width >= 1023px) {
  .content {
    padding-bottom: var(--space-7);
  }
}
</style>
