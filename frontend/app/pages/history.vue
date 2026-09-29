<script setup lang="ts">
import { computed, onMounted } from 'vue'

import { useScanHistory } from '@/entities/scan'
import { useFlags } from '@/shared/config/flags'
import { ROUTES } from '@/shared/config/routes'
import Icon from '@/shared/ui/Icon/Icon.vue'
import { MOCK_HISTORY, ScanHistory } from '@/widgets/ScanHistory'

useHead({ title: 'История сканирования — Своё Вино' })

const flags = useFlags()
const history = useScanHistory()
// История живёт в localStorage — читается только в браузере.
onMounted(history.load)

const items = computed(() =>
  flags.mockScanHistory ? [...history.items.value, ...MOCK_HISTORY] : history.items.value,
)
const hasDemo = computed(() => items.value.some((item) => item.demo))

function clearAll() {
  if (window.confirm('Удалить всю историю сканирования с этого устройства?')) history.clear()
}
</script>

<template>
  <section class="page">
    <div class="head">
      <h1 class="title">История сканирования</h1>
      <button v-if="history.items.value.length" type="button" class="clear" @click="clearAll">
        <Icon name="trash" :size="18" />
        Очистить
      </button>
    </div>
    <p v-if="history.loaded.value || items.length" class="subtitle">
      Хранится только на этом устройстве
    </p>
    <ScanHistory
      :items="items"
      :is-demo="hasDemo"
      :scan-to="ROUTES.scan"
      :browse-to="ROUTES.catalog"
      @remove="history.remove"
    />
  </section>
</template>

<style scoped>
.page {
  padding-top: var(--space-5);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.title {
  font-size: 28px;
}

.subtitle {
  margin: var(--space-1) 0 var(--space-5);
  color: var(--color-text-secondary);
  font-size: 14px;
}

.clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding-inline: var(--space-3);
  border-radius: var(--radius-button);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.clear:hover {
  background-color: var(--color-accent-tint);
}
</style>
