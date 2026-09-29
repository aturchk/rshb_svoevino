<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'

import { useScanFlow } from '@/features/scan-label'
import { Scanner } from '@/widgets/Scanner'

/**
 * Шторка результата и карточка нужны только после снимка — грузятся отдельным
 * чанком, а не вместе с камерой. Чанк подтягивается заранее, когда браузер свободен:
 * к моменту ответа распознавания он уже в кэше.
 */
const loadSheet = () => import('@/widgets/ScanResultSheet/ScanResultSheet.vue')
const loadDetails = () => import('@/widgets/WineDetails/WineDetails.vue')
const ScanResultSheet = defineAsyncComponent(loadSheet)
const WineDetails = defineAsyncComponent(loadDetails)

/**
 * Главный экран продукта: камера на всю высоту между шапкой и таб-баром,
 * затвор в зоне большого пальца. Результат — шторкой поверх замороженного снимка:
 * «Сканировать ещё» возвращает к живой камере без перезагрузки и повторного разрешения.
 */
definePageMeta({ fullHeight: true })
useHead({ title: 'Сканер — Своё Вино' })

const flow = useScanFlow()

onMounted(() => {
  const idle = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1200))
  idle(() => void Promise.all([loadSheet(), loadDetails()]))
})
const sheetOpen = computed(() => flow.phase.value === 'result')
const result = computed(() => flow.outcome.value?.result ?? null)
</script>

<template>
  <section class="scan">
    <h1 class="visually-hidden">Сканер винных бутылок</h1>
    <Scanner :flow="flow" />
    <ScanResultSheet
      v-if="result"
      :open="sheetOpen"
      :result="result"
      @close="flow.reset()"
      @retry="flow.reset()"
      @confirm="flow.confirm"
    >
      <template #details="{ card }">
        <WineDetails :wine="card" variant="sheet" />
      </template>
    </ScanResultSheet>
  </section>
</template>

<style scoped>
.scan {
  height: 100%;
  padding-block: var(--space-3);
}
</style>
