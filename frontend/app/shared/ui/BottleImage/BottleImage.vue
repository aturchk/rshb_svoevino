<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string | null
    /** Реальные размеры файла: дают точный aspect-ratio без скачка вёрстки. */
    width: number
    height: number
    alt: string
    category: string
    /** Ширина бокса в CSS-пикселях; высота считается из пропорции. */
    boxWidth: number
    eager?: boolean
  }>(),
  { eager: false },
)

/** Медиана h/w по 992 резолвящимся фото = 3.56; для заглушки берём её же. */
const PLACEHOLDER_RATIO = 3.56

const ratio = computed(() =>
  props.src && props.width > 0 && props.height > 0
    ? props.height / props.width
    : PLACEHOLDER_RATIO,
)
const boxHeight = computed(() => Math.round(props.boxWidth * ratio.value))

const CATEGORY_CLASS: Record<string, string> = {
  Белое: 'white',
  Красное: 'red',
  Розовое: 'rose',
  Оранжевое: 'orange',
}
const tint = computed(() => CATEGORY_CLASS[props.category] ?? '')
</script>

<template>
  <span class="frame" :style="{ width: `${boxWidth}px`, height: `${boxHeight}px` }">
    <img
      v-if="src"
      class="photo"
      :src="src"
      :alt="alt"
      :width="width"
      :height="height"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'low'"
      decoding="async"
    />
    <!-- Фото нет у 53% позиций: файлов физически нет в выданном пакете.
         Подставлять чужую бутылку вместо настоящей нельзя. -->
    <svg
      v-else
      :class="['placeholder', tint]"
      viewBox="0 0 28 100"
      role="img"
      :aria-label="`${alt}: фотография недоступна`"
    >
      <path
        d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        opacity="0.5"
      />
      <rect x="6" y="48" width="16" height="26" rx="1.5" fill="currentColor" opacity="0.28" />
    </svg>
  </span>
</template>

<style scoped>
.frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.photo {
  width: 100%;
  height: 100%;
  /* contain, не cover: бутылки вырезаны и имеют разные пропорции,
     cover обрезал бы горлышко или этикетку. */
  object-fit: contain;
}

.placeholder {
  width: 100%;
  height: 100%;
  color: var(--bottle-color, var(--color-border-strong));
}

.white {
  --bottle-color: #dcc98e;
}

.red {
  --bottle-color: #8f3d42;
}

.rose {
  --bottle-color: #e0b8ba;
}

.orange {
  --bottle-color: #c98a3c;
}
</style>
