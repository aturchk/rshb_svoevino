<script setup lang="ts">
import type { ScanHistoryItem } from '@/entities/scan'
import { useFlags } from '@/shared/config/flags'
import { ROUTES } from '@/shared/config/routes'
import { ScanHistory, MOCK_HISTORY } from '@/widgets/ScanHistory'

useHead({ title: 'История сканирования — Своё Вино' })

const flags = useFlags()
const EMPTY: ScanHistoryItem[] = []
const items = computed(() => (flags.mockScanHistory ? MOCK_HISTORY : EMPTY))
</script>

<template>
  <section class="page">
    <h1 class="title">История сканирования</h1>
    <ScanHistory :items="items" :is-demo="flags.mockScanHistory" :browse-to="ROUTES.catalog" />
  </section>
</template>

<style scoped>
.page {
  padding-top: var(--space-6);
}

.title {
  margin-bottom: var(--space-5);
  font-size: 26px;
}
</style>
