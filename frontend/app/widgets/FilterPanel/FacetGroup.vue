<script setup lang="ts">
import { computed, ref } from 'vue'

import { normalizeSearchText } from '@/shared/lib/normalize'
import Chip from '@/shared/ui/Chip/Chip.vue'

const props = withDefaults(
  defineProps<{
    legend: string
    labels: readonly string[]
    counts: Int32Array
    selected: number[]
    /** Значения фасеты, если они не совпадают с индексом (например, «стиль не указан» = -1). */
    values?: readonly number[]
    searchable?: boolean
    searchPlaceholder?: string
    open?: boolean
  }>(),
  { searchable: false, open: false, values: undefined, searchPlaceholder: undefined },
)

const emit = defineEmits<{ toggle: [value: number] }>()

const term = ref('')
const expanded = ref(false)
/** На телефоне восемь чипов вместо двадцати: иначе группа занимает экран. */
const INITIAL_LIMIT = 8

const items = computed(() => {
  const all = props.labels.map((label, slot) => {
    const value = props.values?.[slot] ?? slot
    return {
      value,
      label,
      count: props.counts[slot] ?? 0,
      selected: props.selected.includes(value),
    }
  })
  const needle = normalizeSearchText(term.value)
  const matched = needle
    ? all.filter((item) => normalizeSearchText(item.label).includes(needle))
    : all
  // Выбранное всегда наверху и всегда видно, даже если выпало из топа по счётчику.
  return [...matched].sort((a, b) => {
    if (a.selected !== b.selected) return a.selected ? -1 : 1
    return b.count - a.count
  })
})

const visible = computed(() =>
  props.searchable && !expanded.value && !term.value
    ? items.value.slice(0, INITIAL_LIMIT)
    : items.value,
)
const hiddenCount = computed(() => items.value.length - visible.value.length)
const selectedCount = computed(() => props.selected.length)
</script>

<template>
  <details class="group" :open="open || selectedCount > 0">
    <summary class="summary">
      <span class="legend">{{ legend }}</span>
      <span v-if="selectedCount > 0" class="badge">{{ selectedCount }}</span>
      <svg class="caret" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </summary>

    <div class="content">
      <input
        v-if="searchable"
        v-model="term"
        type="search"
        class="facetSearch"
        :placeholder="searchPlaceholder"
        :aria-label="`Поиск: ${legend.toLowerCase()}`"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
      />

      <p v-if="visible.length === 0" class="nothing">Ничего не найдено</p>
      <div v-else class="chips">
        <Chip
          v-for="item in visible"
          :key="item.value"
          :label="item.label"
          :count="item.count"
          :checked="item.selected"
          @toggle="emit('toggle', item.value)"
        />
      </div>

      <button v-if="hiddenCount > 0" type="button" class="more" @click="expanded = true">
        Показать ещё {{ hiddenCount }}
      </button>
    </div>
  </details>
</template>

<style scoped>
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
  color: var(--color-text);
}

.badge {
  min-width: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background-color: var(--color-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
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

.facetSearch {
  width: 100%;
  min-height: 44px;
  padding: 9px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background-color: var(--color-surface);
  /* 16px обязательны: при меньшем размере iOS зумит страницу при фокусе. */
  font-size: 16px;
}

.facetSearch:focus-visible {
  border-color: var(--color-accent);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.more {
  align-self: flex-start;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-3);
  margin-inline: calc(var(--space-3) * -1);
  color: var(--color-accent);
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.nothing {
  color: var(--color-text-muted);
  font-size: 14px;
}
</style>
