<script setup lang="ts">
import { computed, watch } from 'vue'

import type { CameraStatus } from '@/entities/scan/lib/useCameraStream'
import { useCameraStream } from '@/entities/scan/lib/useCameraStream'
import { useSwipe } from '@/features/scan-toggle'
import { ROUTES } from '@/shared/config/routes'
import Button from '@/shared/ui/Button/Button.vue'

const props = defineProps<{ collapsed: boolean; panelHeight: number }>()
const emit = defineEmits<{ collapse: [] }>()

const { status, video, start, stop } = useCameraStream()

/** Что говорим пользователю в каждом состоянии. «Не работает» — не ответ. */
const STATE_TEXT: Record<Exclude<CameraStatus, 'streaming'>, string> = {
  idle: 'Наведите камеру на этикетку — мы покажем, что она видит.',
  requesting: 'Ждём разрешения на доступ к камере…',
  denied:
    'Доступ к камере запрещён. Разрешите его в настройках сайта в адресной строке браузера и попробуйте снова.',
  'not-found': 'Камера не найдена. Похоже, на этом устройстве её нет.',
  busy: 'Камера занята другим приложением. Закройте его и попробуйте снова.',
  insecure:
    'Камера доступна только на защищённом соединении. Откройте сайт по https — по обычному http браузер её не даст.',
  unsupported: 'Этот браузер не умеет показывать камеру. Попробуйте Safari или Chrome.',
  error: 'Не удалось включить камеру. Попробуйте ещё раз.',
}

const live = computed(() => status.value === 'streaming')
const canRetry = computed(() =>
  (['idle', 'denied', 'busy', 'error'] as CameraStatus[]).includes(status.value),
)
/** Повторять нечего: камеры нет или контекст незащищённый. */
const suggestCatalog = computed(() =>
  (['not-found', 'insecure', 'unsupported'] as CameraStatus[]).includes(status.value),
)

let wasStreaming = false

// Видоискатель убрали — гасим поток, чтобы на телефоне не горел индикатор.
// Разворот возвращает его сам: он всегда происходит по жесту пользователя,
// поэтому повторного запроса разрешения не будет.
watch(
  () => props.collapsed,
  (collapsed) => {
    if (collapsed) {
      wasStreaming = status.value === 'streaming'
      stop()
    } else if (wasStreaming) {
      wasStreaming = false
      void start()
    }
  },
)

const swipe = useSwipe('up', () => emit('collapse'), {
  enabled: () => !props.collapsed,
  distance: () => props.panelHeight,
})
</script>

<template>
  <!-- Жест живёт на отдельной обёртке, а не на всей панели: иначе в её
     границах браузер не даёт ни скроллить, ни зумить. -->
  <div class="gestureZone" v-bind="swipe">
    <button
    type="button"
    class="grabber"
    aria-label="Свернуть сканер"
    @click="emit('collapse')"
    >
    <span class="grabberBar" />
    </button>

    <div class="stage">
      <!-- playsinline обязателен: без него iOS Safari уводит поток
           в нативный полноэкранный плеер и жест становится недоступен. -->
      <video
        ref="video"
        class="video"
        playsinline
        muted
        autoplay
        disablepictureinpicture
        aria-label="Изображение с камеры"
        :style="{ display: live ? 'block' : 'none' }"
      />

      <span class="corner tl" :class="{ idle: !live }" />
      <span class="corner tr" :class="{ idle: !live }" />
      <span class="corner bl" :class="{ idle: !live }" />
      <span class="corner br" :class="{ idle: !live }" />

      <div v-if="!live" class="state" role="status" aria-live="polite">
        <span v-if="status === 'requesting'" class="spinner" aria-hidden="true" />
        <svg
          v-else
          class="icon"
          width="38"
          height="38"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <p class="stateText">{{ STATE_TEXT[status as Exclude<CameraStatus, 'streaming'>] }}</p>
        <Button v-if="canRetry" size="sm" @click="start">
          {{ status === 'idle' ? 'Включить камеру' : 'Попробовать снова' }}
        </Button>
        <NuxtLink v-else-if="suggestCatalog" :to="ROUTES.catalog" class="fallback">
          Найти вино вручную
        </NuxtLink>
      </div>
    </div>

    <p class="hint">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 19V5m0 0-6 6m6-6 6 6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      Смахните вверх, чтобы свернуть
    </p>
  </div>
</template>

<style scoped>
.gestureZone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  max-width: var(--container-max);
  margin: 0 auto;
  padding: var(--space-1) var(--space-4) var(--space-3);
  /* Вертикальный жест забираем себе, зум оставляем браузеру. */
  touch-action: pinch-zoom;
  user-select: none;
  -webkit-user-select: none;
}

.grabber {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 28px;
}

.grabberBar {
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background-color: var(--color-border-strong);
}

.stage {
  position: relative;
  /* Сканер — основной сценарий, поэтому видоискатель занимает не меньше 40%
     высоты экрана. Размер задаём шириной: при заданной высоте max-width
     ломает aspect-ratio, а так пропорция держится всегда.
     dvh, а не vh: иначе на iOS высота скачет вместе с адресной строкой. */
  width: min(86vw, 400px, calc(46dvh * 3 / 4));
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background-color: var(--color-surface-soft);
  display: grid;
  place-items: center;
}

.video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* cover обязателен: поток 4:3 или 16:9 не совпадает с рамкой 3:4,
     без него этикетка растянется. */
  object-fit: cover;
  background-color: #1a1614;
}

.corner {
  position: absolute;
  z-index: 1;
  width: 32px;
  height: 32px;
  border: 2px solid #fff;
  filter: drop-shadow(0 0 2px rgb(0 0 0 / 35%));
}

.corner.idle {
  border-color: var(--color-accent);
  filter: none;
}

.tl {
  top: 14px;
  left: 14px;
  border-right: none;
  border-bottom: none;
  border-radius: 12px 0 0;
}

.tr {
  top: 14px;
  right: 14px;
  border-left: none;
  border-bottom: none;
  border-radius: 0 12px 0 0;
}

.bl {
  bottom: 14px;
  left: 14px;
  border-right: none;
  border-top: none;
  border-radius: 0 0 0 12px;
}

.br {
  bottom: 14px;
  right: 14px;
  border-left: none;
  border-top: none;
  border-radius: 0 0 12px;
}

.state {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  text-align: center;
}

.icon {
  color: var(--color-accent);
  opacity: 0.35;
}

.stateText {
  max-width: 30ch;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.fallback {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  font-size: 14px;
}

.hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--color-border-strong);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
}

@media (width >= 1023px) {
  .stage {
    width: min(300px, calc(38dvh * 3 / 4));
  }

  .grabber {
    display: none;
  }
}
</style>
