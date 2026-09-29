<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { DemoScenario } from '@/entities/scan'
import type { CameraStatus } from '@/entities/scan/lib/useCameraStream'
import { useCameraStream } from '@/entities/scan/lib/useCameraStream'
import type { useScanFlow } from '@/features/scan-label'
import { useFlags } from '@/shared/config/flags'
import { ROUTES } from '@/shared/config/routes'
import { haptic } from '@/shared/lib/haptics'
import type { Platform } from '@/shared/lib/platform'
import { detectPlatform } from '@/shared/lib/platform'
import Button from '@/shared/ui/Button/Button.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'
import type { IconName } from '@/shared/ui/Icon/icons'

const props = defineProps<{ flow: ReturnType<typeof useScanFlow> }>()

const camera = useCameraStream()
const flags = useFlags()
const fileInput = ref<HTMLInputElement | null>(null)
const platform = ref<Platform>('other')
const flashing = ref(false)

const phase = computed(() => props.flow.phase.value)
const live = computed(() => camera.status.value === 'streaming')
const busy = computed(() => phase.value === 'processing')
/** Пока идёт распознавание или открыт результат, в видоискателе замороженный снимок. */
const frozen = computed(() => phase.value !== 'live' && props.flow.preview.value !== null)

interface Message {
  icon: IconName
  title: string
  text: string
  /** Главная кнопка: что делать дальше */
  action: 'start' | 'upload' | 'retry-scan' | 'catalog' | null
  /** Второстепенная */
  secondary: 'upload' | 'start' | 'back' | null
}

const DENIED_HOWTO: Record<Platform, string> = {
  ios: 'Нажмите «аА» в адресной строке → «Настройки веб-сайта» → «Камера» → «Разрешить» и обновите страницу.',
  android:
    'Нажмите на значок слева от адреса сайта → «Разрешения» → «Камера» → «Разрешить» и обновите страницу.',
  other: 'Разрешите доступ к камере в настройках сайта — значок слева от адресной строки.',
}

const CAMERA_MESSAGES: Record<
  Exclude<CameraStatus, 'streaming'>,
  Omit<Message, 'text'> & { text: string | null }
> = {
  idle: {
    icon: 'scan',
    title: 'Наведите камеру на бутылку',
    text: 'Найдём вино в каталоге «Своё Вино» за пару секунд — с описанием, похожими винами и советом сомелье.',
    action: 'start',
    secondary: 'upload',
  },
  requesting: {
    icon: 'camera',
    title: 'Разрешите доступ к камере',
    text: 'Браузер спросит разрешение — нажмите «Разрешить».',
    action: null,
    secondary: 'upload',
  },
  denied: {
    icon: 'lock',
    title: 'Нет доступа к камере',
    text: null,
    action: 'upload',
    secondary: 'start',
  },
  'not-found': {
    icon: 'camera-off',
    title: 'Камера не найдена',
    text: 'Похоже, на этом устройстве её нет. Загрузите фото бутылки из галереи.',
    action: 'upload',
    secondary: null,
  },
  busy: {
    icon: 'camera-off',
    title: 'Камера занята',
    text: 'Её использует другое приложение. Закройте его и попробуйте снова — или загрузите фото.',
    action: 'start',
    secondary: 'upload',
  },
  insecure: {
    icon: 'lock',
    title: 'Камера работает только по HTTPS',
    text: 'По обычному http браузер камеру не даёт. Откройте сайт по защищённому адресу — а фото можно загрузить и так.',
    action: 'upload',
    secondary: null,
  },
  unsupported: {
    icon: 'camera-off',
    title: 'Браузер не показывает камеру',
    text: 'Попробуйте Safari или Chrome — или загрузите фото бутылки.',
    action: 'upload',
    secondary: null,
  },
  error: {
    icon: 'camera-off',
    title: 'Не удалось включить камеру',
    text: 'Попробуйте ещё раз или загрузите фото бутылки.',
    action: 'start',
    secondary: 'upload',
  },
}

const message = computed<Message | null>(() => {
  if (phase.value === 'unavailable') {
    return {
      icon: 'info',
      title: 'Распознавание пока не подключено',
      text: 'Сервис распознавания вина ещё в работе. Найдите вино по названию в каталоге — это займёт пару секунд.',
      action: 'catalog',
      secondary: 'back',
    }
  }
  if (phase.value === 'error') {
    return {
      icon: 'circle-alert',
      title: 'Не получилось',
      text: props.flow.errorText.value,
      action: 'retry-scan',
      secondary: 'upload',
    }
  }
  if (phase.value !== 'live' || live.value) return null
  const base = CAMERA_MESSAGES[camera.status.value as Exclude<CameraStatus, 'streaming'>]
  return { ...base, text: base.text ?? DENIED_HOWTO[platform.value] }
})

const shutterLabel = computed(() => {
  if (live.value) return 'Снять'
  if (camera.status.value === 'idle' || camera.status.value === 'requesting') return 'Камера'
  return 'Фото'
})

function openGallery() {
  fileInput.value?.click()
}

async function onShutter() {
  if (busy.value) return
  if (live.value) {
    const blob = await camera.capture()
    if (!blob) return
    flashing.value = true
    window.setTimeout(() => (flashing.value = false), 320)
    void props.flow.scan(blob)
    return
  }
  if (
    camera.status.value === 'idle' ||
    camera.status.value === 'busy' ||
    camera.status.value === 'error'
  ) {
    haptic('tap')
    void camera.start()
    return
  }
  openGallery()
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Сброс значения: повторный выбор того же файла тоже должен сработать.
  input.value = ''
  if (file) void props.flow.scan(file)
}

function act(action: Message['action'] | Message['secondary']) {
  switch (action) {
    case 'start':
      void camera.start()
      break
    case 'upload':
      openGallery()
      break
    case 'retry-scan':
    case 'back':
      props.flow.reset()
      break
    case 'catalog':
      void navigateTo(ROUTES.catalog)
      break
  }
}

const ACTION_LABEL: Record<NonNullable<Message['action'] | Message['secondary']>, string> = {
  start: 'Включить камеру',
  upload: 'Загрузить фото',
  'retry-scan': 'Попробовать ещё раз',
  catalog: 'Найти в каталоге',
  back: 'Назад к камере',
}

/* ——— Шаги распознавания: ожидание не должно выглядеть зависанием ——— */
const STEPS = ['Обрабатываем снимок', 'Ищем в каталоге «Своё Вино»', 'Почти готово'] as const
const step = ref(0)
let stepTimer = 0
watch(busy, (value) => {
  window.clearInterval(stepTimer)
  step.value = 0
  if (value) {
    stepTimer = window.setInterval(() => {
      step.value = Math.min(step.value + 1, STEPS.length - 1)
    }, 900)
  }
})

/* ——— Демо-режим ——— */
const DEMO_OPTIONS: { value: DemoScenario; label: string }[] = [
  { value: 'auto', label: 'По кругу: все три исхода' },
  { value: 'matched', label: 'Вино найдено' },
  { value: 'low_confidence', label: 'Не уверены' },
  { value: 'not_found', label: 'Нет в каталоге' },
]
const demoOpen = ref(false)
const demoLabel = computed(
  () => DEMO_OPTIONS.find((option) => option.value === props.flow.scenario.value)?.label ?? '',
)
function pickScenario(value: DemoScenario) {
  props.flow.setScenario(value)
  demoOpen.value = false
}

onMounted(async () => {
  platform.value = detectPlatform()
  // Уже выданное разрешение — включаем камеру сами: ни одного лишнего тапа.
  // Если разрешения нет, ждём жеста: запрос без него браузер может запомнить как отказ.
  try {
    const permission = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (permission?.state === 'granted') void camera.start()
    else if (permission?.state === 'denied') camera.status.value = 'denied'
  } catch {
    // Firefox и старые Safari не знают permission «camera» — остаёмся на кнопке.
  }
})

onBeforeUnmount(() => window.clearInterval(stepTimer))
</script>

<template>
  <div class="scanner">
    <div class="stage" :class="{ dark: live || frozen }">
      <!-- playsinline обязателен: без него iOS Safari уводит поток в полноэкранный плеер. -->
      <video
        :ref="(element) => (camera.video.value = element as HTMLVideoElement | null)"
        class="video"
        playsinline
        muted
        autoplay
        disablepictureinpicture
        aria-label="Изображение с камеры"
        :style="{ visibility: live && !frozen ? 'visible' : 'hidden' }"
      />
      <img
        v-if="frozen"
        class="frozen"
        :src="flow.preview.value ?? undefined"
        alt="Снимок бутылки"
      />

      <p v-if="live && phase === 'live'" class="caption">Поместите бутылку целиком в кадр</p>

      <div v-if="busy" class="progress" role="status" aria-live="polite">
        <p class="stepText">
          <Transition name="step" mode="out-in">
            <span :key="step">{{ STEPS[step] }}</span>
          </Transition>
        </p>
        <span class="bar"><span class="barFill" /></span>
        <button type="button" class="cancel" @click="flow.cancel()">Отменить</button>
      </div>

      <div v-if="message" class="message" role="status" aria-live="polite">
        <span class="messageIcon">
          <span v-if="camera.status.value === 'requesting' && phase === 'live'" class="spinner" />
          <Icon v-else :name="message.icon" :size="30" />
        </span>
        <h2 class="messageTitle">{{ message.title }}</h2>
        <p class="messageText">{{ message.text }}</p>
        <div class="messageActions">
          <Button v-if="message.action" size="lg" block @click="act(message.action)">
            {{ ACTION_LABEL[message.action] }}
          </Button>
          <Button v-if="message.secondary" variant="ghost" block @click="act(message.secondary)">
            {{ ACTION_LABEL[message.secondary] }}
          </Button>
        </div>
      </div>

      <div class="topBar">
        <span v-if="flags.liteScan" class="liteBadge" title="Упрощённый поиск по визуальному хэшу; точность на реальных фото не измерена">
          Базовый поиск
        </span>
        <div v-if="flags.demoScan" class="demo">
          <button
            type="button"
            class="demoBadge"
            aria-haspopup="menu"
            :aria-expanded="demoOpen"
            @click="demoOpen = !demoOpen"
          >
            <Icon name="sparkles" :size="14" />
            Демо · {{ demoLabel }}
            <Icon name="chevron-down" :size="14" />
          </button>
          <div v-if="demoOpen" class="demoMenu" role="menu" aria-label="Сценарий демо-режима">
            <p class="demoNote">
              Демо-режим: распознавания нет, вино берётся из каталога по снимку.
            </p>
            <button
              v-for="option in DEMO_OPTIONS"
              :key="option.value"
              type="button"
              role="menuitemradio"
              class="demoOption"
              :aria-checked="flow.scenario.value === option.value"
              @click="pickScenario(option.value)"
            >
              <Icon v-if="flow.scenario.value === option.value" name="check" :size="16" />
              <span v-else class="demoSpacer" />
              {{ option.label }}
            </button>
          </div>
        </div>
        <button
          v-if="camera.torchSupported.value && live && phase === 'live'"
          type="button"
          class="torch"
          :class="{ on: camera.torchOn.value }"
          :aria-pressed="camera.torchOn.value"
          :aria-label="camera.torchOn.value ? 'Выключить фонарик' : 'Включить фонарик'"
          @click="camera.setTorch(!camera.torchOn.value)"
        >
          <Icon :name="camera.torchOn.value ? 'flashlight-off' : 'flashlight'" :size="22" />
        </button>
      </div>

      <div class="flash" :class="{ on: flashing }" aria-hidden="true" />
    </div>

    <div class="controls">
      <button type="button" class="side" :disabled="busy" @click="openGallery">
        <span class="sideIcon"><Icon name="image" :size="24" /></span>
        Галерея
      </button>

      <button
        type="button"
        class="shutter"
        :class="{ ready: live }"
        :disabled="busy"
        :aria-label="
          live
            ? 'Сфотографировать бутылку'
            : shutterLabel === 'Камера'
              ? 'Включить камеру'
              : 'Выбрать фото бутылки'
        "
        @click="onShutter"
      >
        <span class="shutterDisc">
          <Icon v-if="!live" :name="shutterLabel === 'Фото' ? 'image' : 'camera'" :size="28" />
        </span>
      </button>

      <NuxtLink :to="ROUTES.catalog" class="side">
        <span class="sideIcon"><Icon name="search" :size="24" /></span>
        Найти
      </NuxtLink>
    </div>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="image/*"
      tabindex="-1"
      aria-hidden="true"
      @change="onFile"
    />
  </div>
</template>

<style scoped>
.scanner {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  max-width: 520px;
  margin-inline: auto;
}

/* Сцена: кремовая, как блок сканера на сайте, а с живой камерой — тёмная. */
.stage {
  position: relative;
  flex: 1;
  min-height: 280px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-cream);
  isolation: isolate;
}

.stage.dark {
  background-color: var(--color-stage);
}

.video,
.frozen {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Показываем весь поток, чтобы видоискатель соответствовал полному снимку. */
  object-fit: contain;
}

.frozen {
  animation: freeze 0.3s ease-out both;
}

.caption {
  position: absolute;
  left: 50%;
  bottom: var(--space-4);
  padding: 8px 14px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: var(--radius-pill);
  background-color: rgb(255 255 255 / 72%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transform: translateX(-50%);
}

.progress {
  position: absolute;
  inset-inline: var(--space-4);
  bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) var(--space-1);
  border-radius: var(--radius-card);
  background-color: rgb(255 255 255 / 86%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.stepText {
  min-height: 22px;
  font-weight: 600;
  text-align: center;
}

.bar {
  position: relative;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background-color: var(--color-accent-tint-hover);
}

/* Шкала ожидания на 3 секунды — ровно SLA из ТЗ. Доходит до 90% и ждёт ответа. */
.barFill {
  position: absolute;
  inset: 0;
  background-color: var(--color-accent);
  transform-origin: left;
  animation: fill 3s var(--ease-out) forwards;
}

.cancel {
  min-height: 44px;
  padding-inline: var(--space-4);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.message {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-5);
  overflow-y: auto;
  background-color: var(--color-surface-cream);
  text-align: center;
  animation: fade 0.25s ease-out both;
}

.messageIcon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: var(--space-2);
  border-radius: 50%;
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  box-shadow: var(--shadow-gold);
}

.messageTitle {
  font-size: 22px;
}

.messageText {
  max-width: 34ch;
  color: var(--color-text-secondary);
  font-size: 15px;
  line-height: 22px;
}

.messageActions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: min(100%, 320px);
  margin-top: var(--space-3);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-accent-tint-hover);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.topBar {
  position: absolute;
  top: var(--space-3);
  inset-inline: var(--space-3);
  z-index: 3;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  pointer-events: none;
}

.topBar > * {
  pointer-events: auto;
}

.demo {
  position: relative;
}

.liteBadge {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-floating);
}

.demoBadge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--shadow-floating);
}

.demoMenu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 250px;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  box-shadow: var(--shadow-elevated);
  animation: fade 0.2s ease-out both;
}

.demoNote {
  padding: var(--space-2);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}

.demoOption {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  padding-inline: var(--space-2);
  border-radius: var(--radius-sm);
  font-size: 15px;
  text-align: left;
}

.demoOption:hover {
  background-color: var(--color-accent-tint);
}

.demoOption[aria-checked='true'] {
  color: var(--color-accent);
  font-weight: 600;
}

.demoSpacer {
  width: 16px;
}

.torch {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-inline-start: auto;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 50%;
  background-color: rgb(255 255 255 / 72%);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  color: var(--color-text);
}

.torch.on {
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
}

.flash {
  position: absolute;
  inset: 0;
  z-index: 4;
  background-color: #fff;
  opacity: 0;
  pointer-events: none;
}

.flash.on {
  animation: flash 0.32s ease-out;
}

/* Управление — в зоне большого пальца: затвор по центру, по бокам галерея и поиск. */
.controls {
  flex: none;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-items: center;
  padding-block: var(--space-1);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 72px;
  min-height: 64px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.side:disabled {
  opacity: 0.3;
}

.sideIcon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--color-accent-tint);
  color: var(--color-accent);
  transition:
    background-color 0.3s ease-in,
    transform var(--transition-base);
}

.side:active .sideIcon {
  background-color: var(--color-accent-tint-hover);
  transform: scale(0.94);
}

/* Затвор: бордовое кольцо и диск — главная кнопка экрана. */
.shutter {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border: 4px solid var(--color-accent);
  border-radius: 50%;
  background-color: var(--color-bg);
  -webkit-tap-highlight-color: transparent;
}

.shutterDisc {
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background-color: var(--color-accent);
  color: #fff;
  transition:
    transform 0.15s ease-out,
    background-color 0.3s ease-in;
}

.shutter:active:not(:disabled) .shutterDisc {
  background-color: var(--color-accent-active);
  transform: scale(0.9);
}

.shutter:disabled {
  opacity: 0.4;
}

@keyframes fill {
  from {
    transform: scaleX(0.04);
  }

  to {
    transform: scaleX(0.9);
  }
}

@keyframes flash {
  from {
    opacity: 0.85;
  }

  to {
    opacity: 0;
  }
}

@keyframes freeze {
  from {
    opacity: 0.6;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.step-enter-active,
.step-leave-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.step-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.step-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .flash.on,
  .frozen,
  .message,
  .demoMenu {
    animation: none;
  }

  .spinner {
    animation-duration: 2s;
  }

  .barFill {
    animation-duration: 0.01s;
  }

  .step-enter-active,
  .step-leave-active {
    transition: none;
  }
}
</style>
