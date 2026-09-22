<script setup lang="ts">
import { computed } from 'vue'

import type { FacetCounts, WineIndex, WineQuery } from '@/entities/wine'

const props = defineProps<{
  index: WineIndex
  query: WineQuery
  counts: FacetCounts
}>()

const emit = defineEmits<{
  toggleCategory: [value: number]
  toggleStyle: [value: number]
  toggleSparkling: []
}>()

/**
 * Самый частый запрос у полки — «красное сухое» — без этого ряда стоит четырёх
 * тапов со скроллом внутри модальной шторки. Здесь он стоит одного.
 */
const quick = computed(() => {
  const { categories, styles } = props.index.dict
  const items: Array<{ key: string; label: string; active: boolean; count: number; act: () => void }> =
    []

  for (const label of ['Красное', 'Белое', 'Розовое', 'Оранжевое']) {
    const value = categories.indexOf(label)
    if (value < 0) continue
    items.push({
      key: `cat-${value}`,
      label,
      active: props.query.categories.includes(value),
      count: props.counts.categories[value] ?? 0,
      act: () => emit('toggleCategory', value),
    })
  }

  items.push({
    key: 'sparkling',
    label: 'Игристое',
    active: props.query.sparklingOnly,
    count: 1,
    act: () => emit('toggleSparkling'),
  })

  for (const label of ['Сухое', 'Полусухое', 'Полусладкое']) {
    const value = styles.indexOf(label)
    if (value < 0) continue
    items.push({
      key: `style-${value}`,
      label,
      active: props.query.styles.includes(value),
      count: props.counts.styles[value] ?? 0,
      act: () => emit('toggleStyle', value),
    })
  }

  return items
})
</script>

<template>
  <div class="scroller">
    <ul class="row">
      <li v-for="item in quick" :key="item.key">
        <button
          type="button"
          role="switch"
          :aria-checked="item.active"
          :disabled="!item.active && item.count === 0"
          class="chip"
          :class="{ active: item.active }"
          @click="item.act()"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.scroller {
  /* Вылезаем за поля контейнера, чтобы ряд скроллился от края до края. */
  margin-inline: calc(var(--container-pad) * -1);
  padding-inline: var(--container-pad);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.scroller::-webkit-scrollbar {
  display: none;
}

.row {
  display: flex;
  gap: var(--space-2);
  width: max-content;
}

.chip {
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  color: var(--color-text);
  font-size: 14px;
  white-space: nowrap;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.chip:disabled {
  opacity: 0.4;
}

.active {
  background-color: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

@media (width >= 1023px) {
  /* На десктопе есть постоянная колонка фильтров — ряд дублировал бы её. */
  .scroller {
    display: none;
  }
}
</style>
