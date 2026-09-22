<script setup lang="ts">
import { computed, ref } from 'vue'

import { useWineDataset } from '@/entities/wine/api/useWineDataset'
import { runQuery } from '@/entities/wine/lib/query'
import { countActiveFilters, hasActiveFilters, serializeQuery, useWineQuery } from '@/features/wine-filters'
import { winesPlural } from '@/shared/lib/plural'
import Button from '@/shared/ui/Button/Button.vue'
import Sheet from '@/shared/ui/Sheet/Sheet.vue'
import Skeleton from '@/shared/ui/Skeleton/Skeleton.vue'
import { CatalogList } from '@/widgets/CatalogList'
import { FilterPanel } from '@/widgets/FilterPanel'
import { QuickChips } from '@/widgets/QuickChips'

useHead({ title: 'Каталог вин — Своё Вино' })

const { data, error, pending } = useWineDataset()
const { query, text, abvDraft, update, toggleValue, commitAbv, reset } = useWineQuery()

const sheetOpen = ref(false)

const signature = computed(() => serializeQuery(query.value).toString())
const result = computed(() => (data.value ? runQuery(data.value.index, query.value) : null))
const activeCount = computed(() => countActiveFilters(query.value))
const canReset = computed(() => hasActiveFilters(query.value))
const found = computed(() => result.value?.ids.length ?? 0)
</script>

<template>
  <section>
    <h1 class="visually-hidden">Каталог вин «Своё Вино»</h1>

    <div class="toolbar">
      <div class="searchRow">
        <input
          v-model="text"
          type="search"
          class="search"
          placeholder="Вино или винодельня"
          aria-label="Поиск по каталогу"
          enterkeyhint="search"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
        />
        <button type="button" class="filtersButton" aria-haspopup="dialog" @click="sheetOpen = true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M7 12h10M10 18h4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span class="filtersLabel">Фильтры</span>
          <span v-if="activeCount > 0" class="badge">{{ activeCount }}</span>
        </button>
      </div>

      <QuickChips
        v-if="data && result"
        :index="data.index"
        :query="query"
        :counts="result.counts"
        @toggle-category="(value) => toggleValue('categories', value)"
        @toggle-style="(value) => toggleValue('styles', value)"
        @toggle-sparkling="update({ sparklingOnly: !query.sparklingOnly })"
      />
    </div>

    <div class="resultRow">
      <span class="count" aria-live="polite">
        {{ result ? `Найдено ${found} ${winesPlural(found)}` : 'Загружаем каталог…' }}
      </span>
      <button v-if="canReset" type="button" class="reset" @click="reset">Сбросить фильтры</button>
    </div>

    <div class="layout">
      <aside class="aside" aria-label="Фильтры">
        <FilterPanel
          v-if="data && result"
          :index="data.index"
          :facets="data.facets"
          :query="query"
          :counts="result.counts"
          :abv-draft="abvDraft"
          @toggle="toggleValue"
          @abv-change="(value) => (abvDraft = value)"
          @abv-commit="commitAbv"
          @update="update"
        />
      </aside>

      <div>
        <p v-if="error" class="error">{{ error }}</p>

        <div v-else-if="pending" aria-hidden="true">
          <div v-for="n in 8" :key="n" class="skeletonRow">
            <Skeleton width="44px" height="72px" radius="8px" />
            <div style="flex: 1">
              <Skeleton width="62%" height="17px" />
              <div style="height: 6px" />
              <Skeleton width="40%" height="14px" />
              <div style="height: 5px" />
              <Skeleton width="52%" height="12px" />
            </div>
          </div>
        </div>

        <div v-else-if="found === 0" class="empty">
          <svg width="48" height="48" viewBox="0 0 28 100" fill="none" aria-hidden="true">
            <path
              d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
              stroke="var(--color-accent)"
              stroke-width="1.5"
              opacity="0.5"
            />
          </svg>
          <h2 class="emptyTitle">Ничего не нашлось</h2>
          <p class="emptyText">
            Попробуйте убрать часть условий — например, снять ограничение по крепости или
            расширить список регионов.
          </p>
          <Button variant="secondary" @click="reset">Сбросить фильтры</Button>
        </div>

        <CatalogList
          v-else-if="data && result"
          :index="data.index"
          :ids="result.ids"
          :signature="signature"
        />
      </div>
    </div>

    <Sheet :open="sheetOpen" title="Фильтры" @close="sheetOpen = false">
      <FilterPanel
        v-if="data && result"
        :index="data.index"
        :facets="data.facets"
        :query="query"
        :counts="result.counts"
        :abv-draft="abvDraft"
        @toggle="toggleValue"
        @abv-change="(value) => (abvDraft = value)"
        @abv-commit="commitAbv"
        @update="update"
      />
      <template #footer>
        <Button block @click="sheetOpen = false">
          Показать {{ found }} {{ winesPlural(found) }}
        </Button>
      </template>
    </Sheet>
  </section>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: var(--header-h);
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-block: var(--space-3);
  background-color: var(--color-bg);
}

.searchRow {
  display: flex;
  gap: var(--space-2);
}

.search {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 11px 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background-color: var(--color-surface);
  /* 16px обязательны: при меньшем размере iOS зумит страницу при фокусе. */
  font-size: 16px;
}

.search:focus-visible {
  border-color: var(--color-accent);
}

.filtersButton {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding-inline: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  font-size: 15px;
}

.badge {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--color-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

.resultRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  padding-block: var(--space-2) var(--space-3);
}

.count {
  color: var(--color-text-secondary);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.reset {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-3);
  margin-inline: calc(var(--space-3) * -1);
  color: var(--color-accent);
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}

.aside {
  display: none;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-7) var(--space-5);
  text-align: center;
  background-color: var(--color-surface-cream);
  border-radius: var(--radius-lg);
}

.emptyTitle {
  font-size: 21px;
}

.emptyText {
  max-width: 44ch;
  color: var(--color-text-secondary);
}

.skeletonRow {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 100px;
  border-bottom: 1px solid var(--color-border);
}

.error {
  padding: var(--space-5);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-soft);
  color: var(--color-accent);
}

@media (width <= 574px) {
  .filtersLabel {
    display: none;
  }
}

@media (width >= 1023px) {
  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: var(--space-6);
    align-items: start;
  }

  .aside {
    display: block;
    position: sticky;
    top: calc(var(--header-h) + var(--space-5));
    max-height: calc(100dvh - var(--header-h) - var(--space-6));
    overflow-y: auto;
    padding-inline-end: var(--space-3);
  }

  .filtersButton {
    display: none;
  }
}
</style>
