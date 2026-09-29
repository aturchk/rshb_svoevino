<script setup lang="ts">
import { computed, ref } from 'vue'

import type { WineCard } from '@/entities/wine'
import { CATEGORY_TINT, formatAbv, wineKind } from '@/entities/wine/lib/format'
import { PARAM } from '@/features/wine-filters'
import { ROUTES } from '@/shared/config/routes'
import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'
import WineRail from '@/entities/wine/ui/WineRail.vue'
import { SommelierBlock } from '@/features/sommelier-question'

/**
 * Карточка вина. Два варианта одной и той же вёрстки:
 *  page  — страница /wine/:slug: бутылка → характеристики → описание → сомелье → похожие;
 *  sheet — под мини-карточкой в шторке результата сканирования: героя там уже показали,
 *          поэтому сначала то, ради чего шторку тянут вверх, — сомелье и похожие вина.
 */
const props = withDefaults(defineProps<{ wine: WineCard; variant?: 'page' | 'sheet' }>(), {
  variant: 'page',
})

const isPage = computed(() => props.variant === 'page')
const heading = computed(() => (isPage.value ? 2 : 3))

/** Длинные описания сворачиваются: у полки читают первые строки. */
const DESCRIPTION_CLAMP = 320
const expanded = ref(false)
const longDescription = computed(() => props.wine.description.length > DESCRIPTION_CLAMP)

const tags = computed(() =>
  [
    wineKind(props.wine),
    props.wine.abv !== null ? formatAbv(props.wine.abv) : null,
    props.wine.fortified ? 'Креплёное' : null,
  ].filter((tag): tag is string => Boolean(tag)),
)

/** Сцена бутылки: высота фиксирована, ширина — из пропорции фото. */
const HERO_HEIGHT = 300
const heroBoxWidth = computed(() => {
  const image = props.wine.image
  const ratio = image && image.width > 0 ? image.height / image.width : 3.56
  return Math.max(60, Math.min(160, Math.round(HERO_HEIGHT / ratio)))
})

const tint = computed(() => CATEGORY_TINT[props.wine.category] ?? 'var(--color-border-strong)')
</script>

<template>
  <article class="details" :class="variant">
    <header v-if="isPage" class="hero">
      <div class="stage">
        <BottleImage
          :src="wine.image ? `/${wine.image.detail}` : null"
          :width="wine.image?.width ?? 0"
          :height="wine.image?.height ?? 0"
          :alt="wine.name"
          :category="wine.category"
          :box-width="heroBoxWidth"
          eager
        />
      </div>
      <NuxtLink :to="`${ROUTES.catalog}?${PARAM.wineries}=${wine.wineryId}`" class="winery">
        {{ wine.winery }}
      </NuxtLink>
      <h1 class="title">{{ wine.name }}</h1>
      <ul class="tags">
        <li v-for="tag in tags" :key="tag" class="tag">{{ tag }}</li>
      </ul>
    </header>

    <template v-if="!isPage">
      <SommelierBlock :wine="wine" :heading-level="3" />
      <WineRail :wines="wine.similar" :heading-level="3" class="block" />
    </template>

    <section class="facts block" :aria-label="isPage ? 'Характеристики' : undefined">
      <component :is="`h${heading}`" class="blockTitle">Характеристики</component>
      <dl class="rows">
        <div class="row">
          <span class="thumb"><Icon name="house" :size="20" /></span>
          <dt class="key">Винодельня</dt>
          <dd class="value">
            <NuxtLink :to="`${ROUTES.catalog}?${PARAM.wineries}=${wine.wineryId}`" class="link">
              {{ wine.winery }}
            </NuxtLink>
          </dd>
        </div>
        <div class="row">
          <span class="thumb"><Icon name="map-pin" :size="20" /></span>
          <dt class="key">Регион</dt>
          <dd class="value">{{ wine.region }}</dd>
        </div>
        <div class="row">
          <span class="thumb"><Icon name="grape" :size="20" /></span>
          <dt class="key">Сорт винограда</dt>
          <dd class="value">
            <span v-if="wine.grapes.length === 0" class="dim">в каталоге не указан</span>
            <span v-else class="grapes">
              <NuxtLink
                v-for="(grape, position) in wine.grapes"
                :key="grape"
                :to="`${ROUTES.catalog}?${PARAM.grapes}=${wine.grapeIds[position] ?? 0}`"
                class="grape"
              >
                {{ grape }}
              </NuxtLink>
            </span>
          </dd>
        </div>
        <div class="row">
          <span class="thumb swatch" :style="{ '--tint': tint }" />
          <dt class="key">Категория и цвет</dt>
          <dd class="value">{{ wine.category }} · {{ wine.colorRaw }}</dd>
        </div>
        <div class="row">
          <span class="thumb"><Icon name="droplet" :size="20" /></span>
          <dt class="key">Сахар</dt>
          <dd class="value">
            <template v-if="wine.style">{{ wine.style }}</template>
            <span v-else class="dim">в названии не указан</span>
          </dd>
        </div>
        <div class="row">
          <span class="thumb"><Icon name="percent" :size="20" /></span>
          <dt class="key">Крепость</dt>
          <dd class="value">
            <template v-if="wine.abv !== null">{{ formatAbv(wine.abv) }} об.</template>
            <span v-else class="dim">в каталоге не указана</span>
          </dd>
        </div>
      </dl>
    </section>

    <section class="block">
      <component :is="`h${heading}`" class="blockTitle">О вине</component>
      <p class="description" :class="{ clamped: longDescription && !expanded }">
        {{ wine.description }}
      </p>
      <button
        v-if="longDescription"
        type="button"
        class="more"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Свернуть' : 'Читать полностью' }}
        <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="18" />
      </button>
    </section>

    <template v-if="isPage">
      <SommelierBlock :wine="wine" class="block" />
      <WineRail :wines="wine.similar" class="block" />
    </template>

    <!--
      Блок «Оценки» не рендерится: в выданном датасете нет ни рейтинга, ни отзывов,
      а рисовать пустую шкалу как данные нельзя. Точка расширения: поле `rating`
      в WineDetailFile и плашка в брендовом #f8ecc9 — так рейтинг выглядит на vino-svoe.ru.
    -->
  </article>
</template>

<style scoped>
.details {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.sheet {
  gap: var(--space-5);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

/* Сцена бутылки: кремовая подложка с мягким золотым свечением за бутылкой. */
.stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: 340px;
  margin-bottom: var(--space-3);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(closest-side, rgb(248 236 201 / 90%), rgb(248 236 201 / 0%)) center / 70% 80%
      no-repeat,
    var(--color-surface-cream);
  animation: settle 0.5s var(--ease-out) both;
}

.winery {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding-inline: var(--space-3);
  color: var(--color-accent);
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
}

.title {
  font-size: 32px;
  overflow-wrap: anywhere;
  hyphens: auto;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.tag {
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}

.blockTitle {
  margin-bottom: var(--space-4);
  font-size: 24px;
}

.sheet .blockTitle {
  font-size: 21px;
}

/* Карточка характеристик сайта: крем, радиус 32, строки с миниатюрой 44 px. */
.facts {
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-cream);
}

.rows {
  display: grid;
  gap: var(--space-4);
  margin: 0;
}

.row {
  display: grid;
  grid-template-columns: 44px 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--space-3);
  align-items: center;
}

.thumb {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 2px solid #fff;
  border-radius: var(--radius-md);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  box-shadow: var(--shadow-gold);
}

.swatch {
  background: linear-gradient(
    135deg,
    var(--tint) 0%,
    color-mix(in srgb, var(--tint) 70%, #fff) 100%
  );
}

.key {
  align-self: end;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.value {
  align-self: start;
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  overflow-wrap: anywhere;
}

.dim {
  color: var(--color-text-muted);
}

.link {
  color: var(--color-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: color var(--transition-fast);
}

.link:hover {
  color: var(--color-link-hover);
}

.grapes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--space-3);
}

/* Сорт — ссылка на готовый фильтр каталога; зона нажатия расширена до 44 px. */
.grape {
  position: relative;
  color: var(--color-accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.grape::after {
  content: '';
  position: absolute;
  inset: -12px -4px;
}

.description {
  font-size: 17px;
  line-height: 27px;
  max-width: 680px;
  white-space: pre-line;
}

.clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  line-clamp: 6;
}

.more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  margin-top: var(--space-1);
  color: var(--color-accent);
  font-weight: 600;
}

@keyframes settle {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}

@media (width >= 575px) {
  .facts {
    padding: var(--space-6);
  }
}

@media (width >= 767px) {
  .title {
    font-size: 36px;
  }

  .stage {
    height: 420px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage {
    animation: none;
  }
}
</style>
