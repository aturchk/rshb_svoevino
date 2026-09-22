<script setup lang="ts">
import type { ScanHistoryItem } from '@/entities/scan'
import { warmDataset } from '@/entities/wine/api/useWineDataset'
import { useScannerCollapse, useSwipe } from '@/features/scan-toggle'
import { useFlags } from '@/shared/config/flags'
import { ROUTES } from '@/shared/config/routes'
import { Viewfinder } from '@/widgets/Viewfinder'
import { ScanHistory, MOCK_HISTORY } from '@/widgets/ScanHistory'

const PANEL_ID = 'viewfinder-panel'

useHead({ title: 'Сканер — Своё Вино' })

const { collapsed, panel, shell, height, toggle, expand } = useScannerCollapse()

// Каталог понадобится сразу после распознавания — греем его заранее,
// но уже после первой отрисовки и низшим приоритетом.
onMounted(() => {
  const schedule = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
  schedule(() => warmDataset())
})

// Свёрнутую панель тянуть не за что — она не видна. Обратный жест ловим полосой.
const swipeDown = useSwipe('down', expand, {
  enabled: () => collapsed.value,
  distance: () => height.value || 200,
})

const flags = useFlags()
const EMPTY: ScanHistoryItem[] = []
const items = computed(() => (flags.mockScanHistory ? MOCK_HISTORY : EMPTY))
</script>

<template>
  <div>
    <div
      :id="PANEL_ID"
      ref="panel"
      class="panel"
      :class="{ hidden: collapsed }"
      :inert="collapsed"
    >
      <Viewfinder :collapsed="collapsed" :panel-height="height" @collapse="toggle" />
    </div>

    <!-- Когда видоискатель свёрнут, в верхней части интерфейса появляется
         компактная кнопка, разворачивающая его обратно. -->
    <div v-show="collapsed" class="restoreBar" v-bind="swipeDown">
      <button
        type="button"
        class="restore"
        :aria-expanded="!collapsed"
        :aria-controls="PANEL_ID"
        @click="expand"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        Сканировать
      </button>
    </div>

    <div ref="shell">
      <!-- Распорка резервирует место под фиксированную панель. Её высота
           меняется мгновенно — анимируется только transform. -->
      <div class="spacer" :style="{ height: collapsed ? '0px' : `${height}px` }" />

      <section class="recent">
        <h1 class="title">Последние сканирования</h1>
        <ScanHistory :items="items" :is-demo="flags.mockScanHistory" :browse-to="ROUTES.catalog" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: fixed;
  inset-inline: 0;
  top: var(--header-h);
  z-index: 20;
  background-color: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  contain: layout paint;
}

.hidden {
  transform: translateY(-100%);
  opacity: 0;
  visibility: hidden;
}

.restoreBar {
  position: sticky;
  top: var(--header-h);
  z-index: 15;
  display: flex;
  justify-content: center;
  padding-block: var(--space-2);
  background-color: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  touch-action: pan-x pinch-zoom;
}

.restore {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 10px 20px;
  border-radius: 999px;
  background-color: var(--color-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  transition: background-color var(--transition-fast);
}

.restore:hover {
  background-color: var(--color-accent-hover);
}

.spacer {
  flex: none;
}

.recent {
  padding-top: var(--space-6);
}

.title {
  margin-bottom: var(--space-4);
  font-size: 24px;
}
</style>
