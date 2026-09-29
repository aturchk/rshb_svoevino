<script setup lang="ts">
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { WineIndex } from '@/entities/wine'
import { STYLE_UNKNOWN } from '@/entities/wine'
import {
  ROW_HEIGHT_DESKTOP,
  ROW_HEIGHT_MOBILE,
  VIRTUAL_OVERSCAN,
} from '@/shared/config/constants'
import { IMG_THUMB } from '@/shared/config/dataset-schema'
import { wineRoute } from '@/shared/config/routes'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'

import { saveCatalogScroll, takeCatalogScroll } from './catalogScroll'

const props = defineProps<{
  index: WineIndex
  ids: Uint32Array
  /** Сериализованный запрос: по нему решаем, можно ли восстановить скролл. */
  signature: string
}>()

const isDesktop = useMediaQuery('(min-width: 767px)')
const rowHeight = computed(() => (isDesktop.value ? ROW_HEIGHT_DESKTOP : ROW_HEIGHT_MOBILE))
const thumbWidth = computed(() => (isDesktop.value ? 24 : 22))

const list = ref<HTMLElement | null>(null)
const listTop = ref(0)
let observer: ResizeObserver | null = null

function measure() {
  const node = list.value
  if (!node) return
  const next = Math.round(node.getBoundingClientRect().top + window.scrollY)
  if (next !== listTop.value) listTop.value = next
}

const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: props.ids.length,
    estimateSize: () => rowHeight.value,
    overscan: VIRTUAL_OVERSCAN,
    scrollMargin: listTop.value,
    // Стабильный ключ — slug, а не индекс массива: иначе при смене фильтра
    // Vue переиспользует DOM не тех строк.
    getItemKey: (position: number) => props.index.slugs[props.ids[position] as number] as string,
  })),
)

const rows = computed(() =>
  virtualizer.value.getVirtualItems().map((item) => {
    const id = props.ids[item.index] as number
    const styleSlot = props.index.style[id] as number
    const abv = props.index.abv[id] as number
    const slug = props.index.slugs[id] as string
    return {
      key: item.key as string,
      slug,
      offset: item.start - listTop.value,
      name: props.index.names[id] as string,
      winery: props.index.dict.wineries[props.index.winery[id] as number] ?? '',
      detail: [
        props.index.dict.regions[props.index.region[id] as number],
        styleSlot === STYLE_UNKNOWN ? null : props.index.dict.styles[styleSlot],
        Number.isNaN(abv) ? null : `${String(abv).replace('.', ',')} %`,
      ]
        .filter(Boolean)
        .join(' · '),
      category: props.index.dict.categories[props.index.category[id] as number] ?? '',
      hasImage: props.index.hasImage[id] === 1,
      imgWidth: props.index.imgWidth[id] as number,
      imgHeight: props.index.imgHeight[id] as number,
    }
  }),
)

onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  if (list.value) observer.observe(list.value)
  observer.observe(document.body)
  window.addEventListener('resize', measure)
  window.addEventListener('orientationchange', measure)

  // Возврат с карточки вина не должен ронять пользователя в начало списка.
  const offset = takeCatalogScroll(props.signature)
  if (offset !== null) window.scrollTo({ top: offset, behavior: 'instant' })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  window.removeEventListener('orientationchange', measure)
  saveCatalogScroll(window.scrollY, props.signature)
})
</script>

<template>
  <ul ref="list" class="list" :style="{ height: `${virtualizer.getTotalSize()}px` }">
    <li v-for="row in rows" :key="row.key">
      <NuxtLink
        :to="wineRoute(row.slug)"
        class="row"
        :style="{ height: `${rowHeight}px`, transform: `translateY(${row.offset}px)` }"
      >
        <span class="thumb">
          <BottleImage
            :src="row.hasImage ? `/${IMG_THUMB(row.slug)}` : null"
            :width="row.imgWidth"
            :height="row.imgHeight"
            :alt="row.name"
            :category="row.category"
            :box-width="thumbWidth"
          />
        </span>
        <span class="body">
          <span class="name">{{ row.name }}</span>
          <span class="winery">{{ row.winery }}</span>
          <span class="detail">{{ row.detail }}</span>
        </span>
        <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.list {
  position: relative;
  width: 100%;
}

.row {
  position: absolute;
  inset-inline: 0;
  top: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--transition-fast);
}

.row:hover {
  background-color: var(--color-surface-soft);
}

.thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 15px;
  line-height: 19px;
  color: var(--color-text);
}

.winery,
.detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.winery {
  font-size: 13px;
  line-height: 17px;
  color: var(--color-text-secondary);
}

.detail {
  font-size: 12px;
  line-height: 16px;
  color: var(--color-text-muted);
}

.chevron {
  flex: none;
  color: var(--color-text-faint);
}

@media (width <= 574px) {
  /* На узком экране стрелка съедает место у названия и ничего не сообщает. */
  .chevron {
    display: none;
  }
}

@media (width >= 767px) {
  .name {
    font-size: 17px;
    line-height: 23px;
  }

  .winery {
    font-size: 14px;
  }

  .thumb {
    width: 56px;
  }
}
</style>
