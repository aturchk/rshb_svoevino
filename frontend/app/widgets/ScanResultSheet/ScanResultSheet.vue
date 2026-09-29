<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'

import type { RecognizeResult, ScanCandidate } from '@/entities/scan'
import type { WineCard } from '@/entities/wine'
import { formatAbv, wineKind } from '@/entities/wine/lib/format'
import WineRail from '@/entities/wine/ui/WineRail.vue'
import WineRow from '@/entities/wine/ui/WineRow.vue'
import { ANALOG_COLORS, ANALOG_STYLES, useAnalogSearch } from '@/features/analog-search'
import { ROUTES, wineRoute } from '@/shared/config/routes'
import BottleImage from '@/shared/ui/BottleImage/BottleImage.vue'
import BottomSheet from '@/shared/ui/BottomSheet/BottomSheet.vue'
import type { SheetSnap } from '@/shared/ui/BottomSheet/BottomSheet.vue'
import Button from '@/shared/ui/Button/Button.vue'
import Icon from '@/shared/ui/Icon/Icon.vue'

/**
 * Результат сканирования — три исхода, которые ТЗ требует различать:
 *  matched        — одна карточка, без выбора (референс — Vivino);
 *  low_confidence — лучший кандидат и «Это не то вино?» с почти-дублями;
 *  not_found      — честное «не нашли», похожие вина и уточнение для аналогов.
 * Полная карточка приходит через слот details: виджет не знает, как она устроена.
 */
const props = defineProps<{ open: boolean; result: RecognizeResult | null }>()
const emit = defineEmits<{
  close: []
  retry: []
  confirm: [wine: { slug: string; name: string; winery: string }]
}>()

defineSlots<{ details(props: { card: WineCard }): unknown }>()

const snap = ref<SheetSnap>('peek')
// Новый результат открывается превью; сброс результата при закрытии шторку не трогает.
watch(
  () => props.result,
  (result) => {
    if (result) snap.value = 'peek'
  },
)

const status = computed(() => props.result?.status ?? 'not_found')
const card = computed(() => props.result?.card ?? null)
const candidates = computed<ScanCandidate[]>(() => props.result?.candidates.slice(0, 4) ?? [])

const analogSource = toRef(() => props.result?.analogs ?? [])
const analogs = useAnalogSearch(analogSource)
watch(analogSource, (value) => {
  analogs.color.value = null
  analogs.style.value = null
  analogs.wines.value = value
})

const HEAD = {
  matched: { icon: 'circle-check', text: 'Нашли в каталоге' },
  low_confidence: { icon: 'circle-help', text: 'Похоже, это оно' },
  not_found: { icon: 'search-x', text: 'Не нашли в каталоге' },
} as const

const label = computed(() => HEAD[status.value].text)

const heroMeta = computed(() => {
  const wine = card.value
  if (!wine) return ''
  return [wineKind(wine), wine.abv !== null ? formatAbv(wine.abv) : null, wine.region]
    .filter(Boolean)
    .join(' · ')
})

function confirmCard() {
  if (card.value) emit('confirm', card.value)
}

function pick(candidate: ScanCandidate) {
  emit('confirm', candidate)
  void navigateTo(wineRoute(candidate.slug))
}
</script>

<template>
  <BottomSheet
    :open="open"
    :label="`Результат сканирования: ${label}`"
    :snap="snap"
    @update:snap="snap = $event"
    @close="emit('close')"
  >
    <div v-if="result" class="result" :class="status">
      <p class="status">
        <Icon :name="HEAD[status].icon" :size="20" />
        {{ HEAD[status].text }}
        <span v-if="result.demo" class="demo">Демо</span>
      </p>

      <!-- Найдено или почти найдено: мини-карточка лучшего кандидата -->
      <template v-if="card">
        <div class="hit">
          <div class="hitPhoto">
            <BottleImage
              :src="card.image ? `/${card.image.thumb}` : null"
              :width="card.image?.width ?? 0"
              :height="card.image?.height ?? 0"
              :alt="card.name"
              :category="card.category"
              :box-width="34"
              eager
            />
          </div>
          <div class="hitText">
            <p class="winery">{{ card.winery }}</p>
            <h2 class="name">{{ card.name }}</h2>
            <p class="meta">{{ heroMeta }}</p>
            <p v-if="card.grapes.length" class="meta">{{ card.grapes.join(', ') }}</p>
          </div>
        </div>

        <p v-if="status === 'low_confidence'" class="lead">
          Этикетка похожа на несколько вин каталога — у одной серии бывают разные годы и сахар.
          Проверьте, то ли это вино.
        </p>

        <div class="actions">
          <Button size="lg" block :to="wineRoute(card.slug)" @click="confirmCard">
            {{ status === 'low_confidence' ? 'Да, открыть карточку' : 'Открыть карточку' }}
            <Icon name="chevron-right" :size="20" />
          </Button>
          <Button
            v-if="status === 'matched'"
            variant="secondary"
            size="lg"
            block
            @click="emit('retry')"
          >
            <Icon name="camera" :size="20" />
            Сканировать ещё
          </Button>
        </div>

        <section v-if="status === 'low_confidence' && candidates.length" class="section">
          <h3 class="sectionTitle">Это не то вино?</h3>
          <ul class="candidates">
            <li v-for="candidate in candidates" :key="candidate.slug">
              <WineRow :wine="candidate" @select="pick(candidate)" />
            </li>
          </ul>
          <Button variant="ghost" block @click="emit('retry')">
            <Icon name="retry" :size="18" />
            Нет в списке — сканировать ещё раз
          </Button>
        </section>

        <p v-if="snap === 'peek'" class="pullHint" aria-hidden="true">
          <Icon name="chevron-up" :size="16" />
          Потяните вверх — вся карточка, сомелье и похожие вина
        </p>

        <div class="details">
          <slot name="details" :card="card" />
        </div>
      </template>

      <!-- Не нашли: честно, с советами и аналогами -->
      <template v-else>
        <h2 class="name">Этого вина нет в каталоге «Своё Вино»</h2>
        <p class="lead">
          Либо его ещё не добавили в каталог, либо этикетка не попала в кадр целиком. Попробуйте ещё
          раз — или посмотрите похожие вина.
        </p>
        <ul class="tips">
          <li><Icon name="sun" :size="18" /> Больше света и без бликов на этикетке</li>
          <li><Icon name="scan" :size="18" /> Этикетка целиком в рамке, бутылка прямо</li>
        </ul>
        <div class="actions">
          <Button size="lg" block @click="emit('retry')">
            <Icon name="camera" :size="20" />
            Сканировать ещё раз
          </Button>
          <Button variant="secondary" size="lg" block :to="ROUTES.catalog">
            <Icon name="search" :size="20" />
            Найти по названию
          </Button>
        </div>

        <section class="section">
          <h3 class="sectionTitle">Какое это вино?</h3>
          <p class="hint">Уточните цвет и сахар — подберём аналоги от разных виноделен</p>
          <div class="refine" role="group" aria-label="Цвет">
            <button
              v-for="option in ANALOG_COLORS"
              :key="option.label"
              type="button"
              class="chip"
              :aria-pressed="analogs.color.value === option.label"
              @click="analogs.toggleColor(option.label)"
            >
              {{ option.label }}
            </button>
          </div>
          <div class="refine" role="group" aria-label="Сахар">
            <button
              v-for="option in ANALOG_STYLES"
              :key="option"
              type="button"
              class="chip"
              :aria-pressed="analogs.style.value === option"
              @click="analogs.toggleStyle(option)"
            >
              {{ option }}
            </button>
          </div>
        </section>

        <WineRail
          :wines="analogs.wines.value"
          :pending="analogs.pending.value"
          :heading-level="3"
          title="Похожие вина из каталога"
          :subtitle="
            analogs.color.value || analogs.style.value
              ? 'Подобрали по вашему описанию'
              : 'Подобрали по стилю — это другие вина'
          "
          class="section rail"
        />
        <p v-if="analogs.failed.value" class="hint">
          Не удалось подобрать аналоги — попробуйте ещё раз.
        </p>
      </template>
    </div>
  </BottomSheet>
</template>

<style scoped>
.result {
  --rail-bleed: var(--space-4);

  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: calc(var(--space-2) * -1);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.not_found .status,
.low_confidence .status {
  color: var(--color-text-secondary);
}

.demo {
  margin-inline-start: auto;
  margin-inline-end: 48px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 12px;
}

.hit {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  animation: rise 0.4s var(--ease-out) both;
}

.hitPhoto {
  flex: none;
  display: grid;
  place-items: center;
  width: 84px;
  height: 132px;
  border-radius: var(--radius-card);
  background-color: var(--color-surface-cream);
}

.hitText {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.winery {
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 600;
}

.name {
  font-size: 24px;
  overflow-wrap: anywhere;
}

.meta {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.lead {
  color: var(--color-text-secondary);
  font-size: 15px;
  line-height: 22px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.sectionTitle {
  font-size: 21px;
}

.candidates {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pullHint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.details {
  padding-top: var(--space-2);
}

.tips {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--color-surface-cream);
}

.tips li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 14px;
  line-height: 20px;
}

.tips :deep(svg) {
  color: var(--color-accent);
}

.hint {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.refine {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  transition:
    background-color 0.3s ease-in,
    border-color 0.3s ease-in,
    color 0.3s ease-in;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
  color: #fff;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hit {
    animation: none;
  }
}
</style>
