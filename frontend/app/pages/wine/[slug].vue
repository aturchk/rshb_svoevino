<script setup lang="ts">
import { computed } from 'vue'

import { loadWine } from '@/entities/wine/api/loadWine'
import { ROUTES } from '@/shared/config/routes'
import Button from '@/shared/ui/Button/Button.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'
import Skeleton from '@/shared/ui/Skeleton/Skeleton.vue'
import { WineDetails } from '@/widgets/WineDetails'

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug ?? ''))

// Карточка приходит с бэкенда уже с похожими винами и отдаётся отрендеренной
// сервером: один запрос, без индекса каталога.
const {
  data: wine,
  error,
  status,
  refresh,
} = await useAsyncData(
  () => `wine:${slug.value}`,
  () => loadWine(slug.value),
)

// «Нет такого вина» и «не удалось загрузить» — разные вещи: первому нужен настоящий
// HTTP 404, второму — кнопка «Повторить».
const notFound = computed(() => error.value?.statusCode === 404)
if (import.meta.server && notFound.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

useHead(() => ({
  title: wine.value ? `${wine.value.name} — Своё Вино` : 'Вино — Своё Вино',
  meta: wine.value ? [{ name: 'description', content: wine.value.description.slice(0, 160) }] : [],
}))

/** «Назад» ведёт туда, откуда пришли (шторка сканера, каталог, история), а не всегда в каталог. */
function back() {
  if (import.meta.client && window.history.state?.back) router.back()
  else void navigateTo(ROUTES.catalog)
}
</script>

<template>
  <div class="page">
    <button type="button" class="back" @click="back">
      <Icon name="chevron-left" :size="20" />
      Назад
    </button>

    <section v-if="error && notFound" class="missing">
      <h1 class="missingTitle">Вино не найдено</h1>
      <p class="missingText">В каталоге «Своё Вино» нет позиции с адресом «{{ slug }}».</p>
      <Button variant="secondary" :to="ROUTES.catalog">Вернуться в каталог</Button>
    </section>

    <section v-else-if="error" class="missing">
      <h1 class="missingTitle">Не удалось загрузить карточку</h1>
      <p class="missingText">Проверьте интернет и попробуйте ещё раз.</p>
      <Button variant="secondary" @click="refresh()">Повторить</Button>
    </section>

    <section v-else-if="!wine || status === 'pending'" class="skeleton" aria-busy="true">
      <Skeleton height="340px" radius="var(--radius-lg)" />
      <Skeleton width="40%" height="18px" />
      <Skeleton width="80%" height="34px" />
      <Skeleton height="260px" radius="var(--radius-lg)" />
    </section>

    <WineDetails v-else :wine="wine" />

    <!-- Липкое действие в зоне большого пальца: у полки следующая бутылка — рядом. -->
    <div v-if="wine" class="cta">
      <Button size="lg" block :to="ROUTES.scan">
        <Icon name="camera" :size="20" />
        Сканировать ещё
      </Button>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding-bottom: calc(var(--cta-h) + var(--space-3));
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  margin-block: var(--space-2);
  margin-inline-start: calc(var(--space-2) * -1);
  padding-inline: var(--space-2);
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 600;
  transition: color var(--transition-fast);
}

.back:hover {
  color: var(--color-accent);
}

.skeleton {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.missing {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding-top: var(--space-6);
}

.missingTitle {
  font-size: 28px;
}

.missingText {
  color: var(--color-text-secondary);
}

/* Над таб-баром, с подложкой-градиентом, чтобы текст под кнопкой не читался сквозь неё. */
.cta {
  position: fixed;
  inset-inline: 0;
  bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
  z-index: 30;
  padding: var(--space-5) calc(var(--container-pad) + env(safe-area-inset-right)) var(--space-3)
    calc(var(--container-pad) + env(safe-area-inset-left));
  background: linear-gradient(to bottom, rgb(254 253 250 / 0%), var(--color-bg) 40%);
  pointer-events: none;
  animation: slide-up 0.4s var(--ease-out) 0.2s both;
}

.cta :deep(.button) {
  max-width: 480px;
  margin-inline: auto;
  pointer-events: auto;
  box-shadow: var(--shadow-floating);
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

@media (width >= 1023px) {
  .cta {
    bottom: 0;
    padding-bottom: var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cta {
    animation: none;
  }
}
</style>
