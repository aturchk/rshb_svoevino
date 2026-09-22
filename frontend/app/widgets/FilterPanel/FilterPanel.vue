<script setup lang="ts">
import { computed } from 'vue'

import type { FacetCounts, FacetKey, WineIndex, WineQuery } from '@/entities/wine'
import { STYLE_UNKNOWN } from '@/entities/wine'
import type { WineFacetsFile } from '@/shared/config/dataset-schema'
import RangeSlider from '@/shared/ui/RangeSlider/RangeSlider.vue'
import Toggle from '@/shared/ui/Toggle/Toggle.vue'

import FacetGroup from './FacetGroup.vue'

const props = defineProps<{
  index: WineIndex
  facets: WineFacetsFile
  query: WineQuery
  counts: FacetCounts
  abvDraft: [number, number] | null
}>()

const emit = defineEmits<{
  toggle: [facet: FacetKey, value: number]
  abvChange: [value: [number, number] | null]
  abvCommit: []
  update: [patch: Partial<WineQuery>]
}>()

const abvRange = computed(() => props.facets.ranges.abv)
const current = computed(
  () => props.abvDraft ?? ([abvRange.value.min, abvRange.value.max] as [number, number]),
)

// «Стиль не указан» — полноценное значение фильтра, а не отсутствие данных:
// у 386 позиций сахар в названии просто не написан.
const styleLabels = computed(() => [...props.index.dict.styles, 'Не указан'])
const styleValues = computed(() => [
  ...props.index.dict.styles.map((_, i) => i),
  STYLE_UNKNOWN,
])

const formatAbv = (value: number) => `${value.toFixed(1).replace('.0', '')} % об.`

const includeUnknownAbv = computed({
  get: () => props.query.abvIncludeUnknown,
  set: (value: boolean) => emit('update', { abvIncludeUnknown: value }),
})
const sparklingOnly = computed({
  get: () => props.query.sparklingOnly,
  set: (value: boolean) => emit('update', { sparklingOnly: value }),
})
const withPhotoOnly = computed({
  get: () => props.query.withPhotoOnly,
  set: (value: boolean) => emit('update', { withPhotoOnly: value }),
})
</script>

<template>
  <div class="panel">
    <!-- Порядок групп по важности у полки: цвет и сахар решают выбор,
         винодельня уточняет. Открыт по умолчанию только первый. -->
    <FacetGroup
      legend="Цвет"
      open
      :labels="index.dict.categories"
      :counts="counts.categories"
      :selected="query.categories"
      @toggle="(value) => emit('toggle', 'categories', value)"
    />

    <FacetGroup
      legend="Сахар"
      :labels="styleLabels"
      :values="styleValues"
      :counts="counts.styles"
      :selected="query.styles"
      @toggle="(value) => emit('toggle', 'styles', value)"
    />

    <FacetGroup
      legend="Регион"
      :labels="index.dict.regions"
      :counts="counts.regions"
      :selected="query.regions"
      @toggle="(value) => emit('toggle', 'regions', value)"
    />

    <details class="group">
      <summary class="summary">
        <span class="legend">Крепость</span>
        <svg class="caret" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </summary>
      <div class="content">
        <RangeSlider
          :min="abvRange.min"
          :max="abvRange.max"
          :step="abvRange.step"
          :from="current[0]"
          :to="current[1]"
          label="Крепость"
          :format="formatAbv"
          @change="(from, to) => emit('abvChange', [from, to])"
          @commit="emit('abvCommit')"
        />
        <Toggle
          v-model="includeUnknownAbv"
          label="Показывать вина без указанной крепости"
          :hint="`${facets.totals.withoutAbv} позиций`"
        />
        <p class="note">
          Крепость восстановлена из артикула каталога и известна для
          {{ facets.totals.all - facets.totals.withoutAbv }} вин из {{ facets.totals.all }}.
        </p>
      </div>
    </details>

    <FacetGroup
      legend="Сорт винограда"
      searchable
      search-placeholder="Например, Красностоп"
      :labels="index.dict.grapes"
      :counts="counts.grapes"
      :selected="query.grapes"
      @toggle="(value) => emit('toggle', 'grapes', value)"
    />

    <FacetGroup
      legend="Винодельня"
      searchable
      search-placeholder="Например, Фанагория"
      :labels="index.dict.wineries"
      :counts="counts.wineries"
      :selected="query.wineries"
      @toggle="(value) => emit('toggle', 'wineries', value)"
    />

    <div class="toggles">
      <Toggle v-model="sparklingOnly" label="Только игристые" :hint="`${facets.totals.sparkling}`" />
      <Toggle
        v-model="withPhotoOnly"
        label="Только с фотографией"
        :hint="`${facets.totals.withPhoto}`"
      />
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
}

.group {
  border-bottom: 1px solid var(--color-border);
}

.summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 48px;
  cursor: pointer;
  list-style: none;
}

.summary::-webkit-details-marker {
  display: none;
}

.legend {
  flex: 1;
  font-family: var(--font-display);
  font-size: 18px;
}

.caret {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.group[open] .caret {
  transform: rotate(180deg);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
}

.note {
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 18px;
}

.toggles {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-top: var(--space-4);
}
</style>
