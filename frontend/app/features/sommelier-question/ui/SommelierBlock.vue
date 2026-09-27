<script setup lang="ts">
import { computed, toRef, useId } from 'vue'

import { advise, FOOD_GROUPS, pairingTraitsOf } from '@/entities/pairing'
import type { VerdictLevel } from '@/entities/pairing'
import type { WineCard } from '@/entities/wine'
import WineRow from '@/entities/wine/ui/WineRow.vue'
import { useSommelierQuestion } from '../lib/useSommelierQuestion'
import { wineRoute } from '@/shared/config/routes'
import Icon from '@/shared/ui/Icon/Icon.vue'
import type { IconName } from '@/shared/ui/Icon/icons'
import Skeleton from '@/shared/ui/Skeleton/Skeleton.vue'

const props = withDefaults(defineProps<{ wine: WineCard; headingLevel?: 2 | 3 }>(), {
  headingLevel: 2,
})

const traits = computed(() => pairingTraitsOf(props.wine))
// Правила чистые и быстрые: совет готов уже при серверном рендере карточки.
const advice = computed(() => advise(traits.value))
const slug = toRef(() => props.wine.slug)

const { selected, verdict, alternatives, pending, failed, select, retry } = useSommelierQuestion(
  slug,
  traits,
)

const VERDICT_ICON: Record<VerdictLevel, IconName> = {
  great: 'circle-check',
  good: 'circle-check',
  ok: 'info',
  poor: 'circle-alert',
}

// Два блока на странице (карточка под шторкой) не должны делить id.
const titleId = useId()
const questionId = useId()

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const subheading = computed(() => (props.headingLevel === 2 ? 'h3' : 'h4'))
</script>

<template>
  <section class="sommelier" :aria-labelledby="titleId">
    <header class="head">
      <span class="headIcon"><Icon name="utensils" :size="22" /></span>
      <div class="headText">
        <component :is="`h${headingLevel}`" :id="titleId" class="title">
          Цифровой сомелье
        </component>
        <p class="profile">{{ advice.profile }}</p>
      </div>
    </header>
    <p class="badge">
      <Icon name="sparkles" :size="14" />
      Рекомендация сомелье — по правилам сочетаний, а не данные каталога
    </p>

    <figure v-if="wine.pairingNote" class="note">
      <blockquote class="quote">
        <Icon name="quote" :size="18" class="quoteIcon" />
        <p>{{ wine.pairingNote }}</p>
      </blockquote>
      <figcaption class="cite">Так советует винодельня — из описания в каталоге</figcaption>
    </figure>

    <component :is="subheading" class="subtitle">К чему подать</component>
    <ul class="pairings">
      <li
        v-for="(pairing, position) in advice.pairings"
        :key="pairing.food.id"
        class="pairing"
        :style="{ '--i': position }"
      >
        <span class="emoji" aria-hidden="true">{{ pairing.food.emoji }}</span>
        <span class="pairingText">
          <span class="food">
            {{ pairing.food.label }}
            <span v-if="pairing.level === 'great'" class="great">Отличная пара</span>
          </span>
          <span class="reason">{{ pairing.reason }}</span>
        </span>
      </li>
    </ul>

    <dl class="serving">
      <div class="stat">
        <span class="statIcon"><Icon name="thermometer" :size="20" /></span>
        <dt class="statLabel">Подавать при</dt>
        <dd class="statValue">{{ advice.serving.temperature }}</dd>
      </div>
      <div class="stat">
        <span class="statIcon"><Icon name="wine" :size="20" /></span>
        <dt class="statLabel">Бокал</dt>
        <dd class="statValue">{{ advice.serving.glass }}</dd>
      </div>
    </dl>
    <p v-if="advice.serving.tip" class="tip">{{ advice.serving.tip }}</p>

    <div class="question">
      <component :is="subheading" :id="questionId" class="subtitle"> Что у вас на ужин? </component>
      <p class="hint">Выберите блюдо — сомелье скажет, подойдёт ли это вино</p>
      <div class="chips" role="group" :aria-labelledby="questionId">
        <button
          v-for="group in FOOD_GROUPS"
          :key="group.id"
          type="button"
          class="chip"
          :class="{ active: selected === group.id }"
          :aria-pressed="selected === group.id"
          @click="select(group.id)"
        >
          <span aria-hidden="true">{{ group.emoji }}</span>
          {{ group.label }}
        </button>
      </div>

      <Transition name="verdict" mode="out-in">
        <div
          v-if="verdict"
          :key="verdict.group"
          class="verdict"
          :class="verdict.level"
          role="status"
          aria-live="polite"
        >
          <div class="verdictHead">
            <Icon :name="VERDICT_ICON[verdict.level]" :size="24" class="verdictIcon" />
            <p class="verdictTitle">{{ verdict.title }}</p>
          </div>
          <p v-if="verdict.best" class="verdictText">
            <template v-if="verdict.level === 'poor'">{{ verdict.best.reason }}.</template>
            <template v-else>
              <strong>{{ verdict.best.food.label }}</strong> — {{ lower(verdict.best.reason) }}.
            </template>
          </p>
          <p v-if="verdict.caveat" class="caveat">
            А вот {{ lower(verdict.caveat.food.label) }} — не лучший выбор:
            {{ lower(verdict.caveat.reason) }}.
          </p>

          <div v-if="verdict.suggestAlternatives" class="alternatives">
            <p class="alternativesTitle">Лучше подойдут:</p>
            <div v-if="pending" class="altList" aria-hidden="true">
              <Skeleton v-for="n in 3" :key="n" height="72px" radius="var(--radius-md)" />
            </div>
            <p v-else-if="failed" class="failed">
              Не удалось подобрать вина.
              <button type="button" class="retry" @click="retry">Повторить</button>
            </p>
            <ul v-else class="altList">
              <li v-for="alt in alternatives" :key="alt.slug">
                <WineRow :wine="alt" :to="wineRoute(alt.slug)" :note="alt.reasons[0]" />
              </li>
            </ul>
          </div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
/* Инфоблок сайта: кремовая заливка, радиус 32, без тени и рамки. */
.sommelier {
  padding: var(--space-5) var(--space-4);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-cream);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* Кружок под иконку, как у стат-карточек на странице вина сайта. */
.headIcon,
.statIcon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: var(--color-accent);
  color: rgb(255 255 255 / 92%);
}

.headText {
  min-width: 0;
}

.title {
  font-size: 24px;
}

.profile {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.badge {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: var(--space-3);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background-color: var(--color-surface-gold);
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.badge :deep(svg) {
  margin-top: 1px;
}

.note {
  margin: var(--space-4) 0 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.quote {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  font-size: 15px;
  line-height: 22px;
}

.quoteIcon {
  color: var(--color-accent);
  opacity: 0.5;
}

.cite {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 16px;
}

.subtitle {
  margin-top: var(--space-5);
  margin-bottom: var(--space-3);
  font-size: 19px;
}

.pairings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pairing {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  animation: rise 0.45s var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 50ms);
}

/* Плитка блюда — золотая, как в «Сочетании с блюдами» на сайте. */
.emoji {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background-color: var(--color-surface-gold);
  font-size: 24px;
  line-height: 1;
}

.pairingText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 2px;
}

.food {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--space-2);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}

.great {
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background-color: var(--color-accent-tint);
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

.reason {
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.serving {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
  margin: var(--space-4) 0 0;
}

.stat {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.statIcon {
  grid-row: span 2;
  width: 40px;
  height: 40px;
}

.statLabel {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 16px;
}

.statValue {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  line-height: 24px;
  font-variant-numeric: lining-nums;
}

.tip {
  margin-top: var(--space-2);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.question {
  margin-top: var(--space-2);
}

.question .subtitle {
  margin-bottom: var(--space-1);
}

.hint {
  margin-bottom: var(--space-3);
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background-color: var(--color-surface);
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.3s ease-in,
    border-color 0.3s ease-in,
    color 0.3s ease-in,
    transform var(--transition-base);
}

.chip:active {
  transform: scale(var(--press-scale));
}

.chip.active {
  border-color: var(--color-accent);
  background-color: var(--color-accent);
  color: #fff;
}

.verdict {
  margin-top: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  border-left: 4px solid var(--color-accent);
}

.verdict.ok {
  border-left-color: var(--color-border-strong);
}

.verdict.poor {
  border-left-color: var(--color-accent-deep);
}

.verdictHead {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.verdictIcon {
  color: var(--color-accent);
}

.ok .verdictIcon {
  color: var(--color-text-secondary);
}

.verdictTitle {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 500;
  line-height: 26px;
}

.verdictText,
.caveat {
  margin-top: var(--space-2);
  font-size: 15px;
  line-height: 22px;
}

.caveat {
  color: var(--color-text-secondary);
}

.alternatives {
  margin-top: var(--space-4);
}

.alternativesTitle {
  margin-bottom: var(--space-2);
  font-weight: 600;
}

.altList {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.failed {
  color: var(--color-text-secondary);
}

.retry {
  min-height: 44px;
  padding-inline: var(--space-2);
  color: var(--color-accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.verdict-enter-active,
.verdict-leave-active {
  transition:
    opacity 0.25s var(--ease-out),
    transform 0.25s var(--ease-out);
}

.verdict-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.verdict-leave-to {
  opacity: 0;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@media (width >= 575px) {
  .sommelier {
    padding: var(--space-6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pairing {
    animation: none;
  }

  .chip:active {
    transform: none;
  }

  .verdict-enter-active,
  .verdict-leave-active {
    transition: none;
  }
}
</style>
