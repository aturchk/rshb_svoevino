<script setup lang="ts">
import { computed } from 'vue'

import { loadWine } from '@/entities/wine/api/loadWine'
import { PARAM } from '@/features/wine-filters'
import { ROUTES } from '@/shared/config/routes'
import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'
import Skeleton from '@/shared/ui/Skeleton/Skeleton.vue'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))

// useAsyncData отдаёт карточку уже отрендеренной сервером: один запрос,
// без индекса и справочников.
const { data: wine, error } = await useAsyncData(
  () => `wine:${slug.value}`,
  () => loadWine(slug.value),
)

useHead(() => ({
  title: wine.value ? `${wine.value.name} — Своё Вино` : 'Вино — Своё Вино',
  meta: wine.value ? [{ name: 'description', content: wine.value.description.slice(0, 160) }] : [],
}))

const isDesktop = useMediaQuery('(min-width: 767px)')

const tags = computed(() => {
  const item = wine.value
  if (!item) return []
  return [
    item.category,
    item.style,
    item.sparkling ? 'Игристое' : null,
    item.abv !== null ? `${String(item.abv).replace('.', ',')} % об.` : null,
  ].filter((value): value is string => Boolean(value))
})
</script>

<template>
  <section v-if="error" class="missing">
    <h1 class="missingTitle">Вино не найдено</h1>
    <p class="missingText">В каталоге «Своё Вино» нет позиции с адресом «{{ slug }}».</p>
    <NuxtLink :to="ROUTES.catalog" class="link">Вернуться в каталог</NuxtLink>
  </section>

  <section v-else-if="!wine">
    <Skeleton width="180px" height="20px" />
    <div style="height: 24px" />
    <Skeleton width="100%" height="280px" radius="var(--radius-lg)" />
  </section>

  <article v-else>
    <NuxtLink :to="ROUTES.catalog" class="back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m15 6-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      Каталог
    </NuxtLink>

    <!-- Основное. Фото уменьшено и уведено вбок: у полки бутылка уже в руке,
         её фотография не сообщает ничего, а факты нужны сразу. -->
    <header class="hero">
      <div class="headline">
        <h1 class="title">{{ wine.name }}</h1>
        <div class="tags">
          <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
          <span v-if="wine.style === null" class="tag muted">Сахар не указан</span>
        </div>
      </div>
      <div class="photo">
        <BottleImage
          :src="wine.image ? `/${wine.image.detail}` : null"
          :width="wine.image?.width ?? 0"
          :height="wine.image?.height ?? 0"
          :alt="wine.name"
          :category="wine.category"
          :box-width="isDesktop ? 112 : 72"
          eager
        />
      </div>
    </header>

    <div class="blocks">
      <!-- Происхождение -->
      <section class="block">
        <h2 class="blockTitle">Происхождение</h2>
        <dl class="rows">
          <div class="row">
            <dt class="key">Винодельня</dt>
            <dd class="value">
              <NuxtLink
                :to="`${ROUTES.catalog}?${PARAM.wineries}=${wine.wineryId}`"
                class="link"
              >
                {{ wine.winery }}
              </NuxtLink>
            </dd>
          </div>
          <div class="row">
            <dt class="key">Регион</dt>
            <dd class="value">{{ wine.region }}</dd>
          </div>
        </dl>
      </section>

      <!-- Характеристики -->
      <section class="block">
        <h2 class="blockTitle">Характеристики</h2>
        <dl class="rows">
          <div class="row">
            <dt class="key">Сорт винограда</dt>
            <dd class="value">
              <span v-if="wine.grapes.length === 0">—</span>
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
            <dt class="key">Цвет</dt>
            <dd class="value">
              {{ wine.colorRaw }}
              <span
                v-if="wine.colorFamily !== 'Прочее' && wine.colorFamily !== wine.colorRaw"
                class="dim"
              >
                · {{ wine.colorFamily }}
              </span>
            </dd>
          </div>
          <div class="row">
            <dt class="key">Крепость</dt>
            <dd class="value">
              <template v-if="wine.abv !== null">
                {{ String(wine.abv).replace('.', ',') }} % об.
              </template>
              <span v-else class="dim">в каталоге не указана</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <section class="block">
      <h2 class="blockTitle">Дегустационное описание</h2>
      <p class="description">{{ wine.description }}</p>
    </section>

    <!--
      Блок «Оценки» не рендерится: в выданном датасете нет ни рейтинга, ни отзывов
      ни в одном из девяти полей, а рисовать пустую шкалу как данные нельзя.
      Точка расширения: поле `rating` в WineDetailFile, заполнение в build-dataset.ts
      и плашка в брендовом #f8ecc9 — так рейтинг выглядит на карточках vino-svoe.ru.
    -->
  </article>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  margin-block: var(--space-2) var(--space-3);
  padding-inline: var(--space-3);
  margin-inline-start: calc(var(--space-3) * -1);
  color: var(--color-text-secondary);
  font-size: 15px;
}

.back:hover {
  color: var(--color-accent);
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.headline {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.title {
  font-size: 26px;
  overflow-wrap: anywhere;
  hyphens: auto;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag {
  padding: 6px 14px;
  border-radius: 999px;
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
}

.muted {
  background-color: var(--color-border);
  color: var(--color-text-secondary);
}

.photo {
  flex: none;
  display: grid;
  place-items: center;
  max-height: 42dvh;
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-soft);
}

.blocks {
  display: grid;
  gap: var(--space-5);
}

.block {
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.blockTitle {
  margin-bottom: var(--space-4);
  font-size: 19px;
}

.rows {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

/* На 375px две колонки не помещаются: ключ и значение идут стопкой. */
.row {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-1);
}

.key {
  color: var(--color-text-muted);
  font-size: 14px;
}

.value {
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.dim {
  color: var(--color-text-muted);
}

.link {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.grapes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.grape {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  font-size: 14px;
  color: var(--color-text);
  transition: border-color var(--transition-fast);
}

.grape:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.description {
  font-size: 16px;
  line-height: 26px;
}

.missing {
  padding-top: var(--space-7);
}

.missingTitle {
  margin-bottom: var(--space-3);
  font-size: 26px;
}

.missingText {
  margin-bottom: var(--space-5);
  color: var(--color-text-secondary);
}

@media (width >= 575px) {
  .row {
    grid-template-columns: minmax(120px, 34%) 1fr;
    gap: var(--space-4);
    align-items: baseline;
  }
}

@media (width >= 767px) {
  .title {
    font-size: 38px;
  }

  .photo {
    padding: var(--space-5);
  }

  .blocks {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-6);
  }
}
</style>
