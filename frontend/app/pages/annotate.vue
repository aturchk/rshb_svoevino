<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

definePageMeta({ layout: false })
useHead({ title: 'Разметка полевых фото — Своё Вино' })

interface AnnotationQuery {
  queryId: string
  fileName: string
  imageSha256: string
  labelStatus: string
  trueSlug: string
  reviewStatus: string
  reviewerIds: string
}

interface CatalogChoice {
  slug: string
  wineName: string
  winery: string
  category: string
  region: string
  grape: string
  galleryState: string
  hasReference: boolean
}

interface AnnotationState {
  queries: AnnotationQuery[]
  catalog: CatalogChoice[]
}

type LabelStatus = 'confirmed' | 'not_in_catalog' | 'uncertain' | 'exclude'

const state = ref<AnnotationState | null>(null)
const loadError = ref('')
const saveError = ref('')
const saving = ref(false)
const savedMessage = ref('')
const currentIndex = ref(0)
const selectedSlug = ref('')
const search = ref('')
const reviewerId = ref('annotator-01')
const showCompleted = ref(false)
const zoom = ref(1)
const searchInput = ref<HTMLInputElement | null>(null)

const current = computed(() => state.value?.queries[currentIndex.value] ?? null)
const completed = computed(
  () => state.value?.queries.filter((query) => query.reviewStatus !== 'pending').length ?? 0,
)
const pending = computed(() => (state.value?.queries.length ?? 0) - completed.value)
const progress = computed(() => {
  const total = state.value?.queries.length ?? 0
  return total ? Math.round((completed.value / total) * 100) : 0
})

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const filteredCatalog = computed(() => {
  const catalog = state.value?.catalog ?? []
  const terms = normalize(search.value).split(' ').filter(Boolean)
  const ranked = terms.length
    ? catalog
        .map((wine) => {
          const name = normalize(wine.wineName)
          const winery = normalize(wine.winery)
          const haystack = normalize(
            `${wine.wineName} ${wine.winery} ${wine.category} ${wine.region} ${wine.grape} ${wine.slug}`,
          )
          if (!terms.every((term) => haystack.includes(term))) return null
          const score = terms.reduce(
            (total, term) => total + (name.startsWith(term) ? 4 : 0) + (winery.startsWith(term) ? 2 : 0),
            wine.hasReference ? 1 : 0,
          )
          return { wine, score }
        })
        .filter((entry): entry is { wine: CatalogChoice; score: number } => entry !== null)
        .sort((a, b) => b.score - a.score || a.wine.wineName.localeCompare(b.wine.wineName, 'ru'))
        .map((entry) => entry.wine)
    : catalog
  return { total: ranked.length, visible: ranked.slice(0, 120) }
})

const selectedWine = computed(() =>
  state.value?.catalog.find((wine) => wine.slug === selectedSlug.value),
)

const visibleQueryIndexes = computed(() => {
  const queries = state.value?.queries ?? []
  return queries
    .map((query, index) => ({ query, index }))
    .filter(({ query }) => showCompleted.value || query.reviewStatus === 'pending')
})

function selectCurrent(index: number): void {
  if (!state.value || index < 0 || index >= state.value.queries.length) return
  currentIndex.value = index
  selectedSlug.value = state.value.queries[index]?.trueSlug ?? ''
  search.value = ''
  saveError.value = ''
  savedMessage.value = ''
  zoom.value = 1
}

function move(direction: -1 | 1): void {
  const indexes = visibleQueryIndexes.value.map(({ index }) => index)
  const position = indexes.indexOf(currentIndex.value)
  const next = indexes[position + direction]
  if (next !== undefined) selectCurrent(next)
}

function moveToNextPending(): void {
  const queries = state.value?.queries ?? []
  const after = queries.findIndex(
    (query, index) => index > currentIndex.value && query.reviewStatus === 'pending',
  )
  if (after >= 0) return selectCurrent(after)
  const first = queries.findIndex((query) => query.reviewStatus === 'pending')
  if (first >= 0) selectCurrent(first)
}

async function save(labelStatus: LabelStatus): Promise<void> {
  const query = current.value
  if (!query || saving.value) return
  if (!reviewerId.value.trim()) {
    saveError.value = 'Укажите ID разметчика.'
    return
  }
  if (labelStatus === 'confirmed' && !selectedSlug.value) {
    saveError.value = 'Сначала выберите точную позицию каталога.'
    return
  }
  saving.value = true
  saveError.value = ''
  savedMessage.value = ''
  try {
    const updated = await $fetch<AnnotationQuery>('/api/annotation/save', {
      method: 'POST',
      body: {
        queryId: query.queryId,
        imageSha256: query.imageSha256,
        labelStatus,
        trueSlug: labelStatus === 'confirmed' ? selectedSlug.value : '',
        reviewerId: reviewerId.value.trim(),
      },
    })
    if (state.value) state.value.queries[currentIndex.value] = updated
    savedMessage.value = labelStatus === 'confirmed' ? 'Соответствие сохранено' : 'Статус сохранён'
    window.localStorage.setItem('annotation-reviewer-id', reviewerId.value.trim())
    window.setTimeout(moveToNextPending, 350)
  } catch (error: unknown) {
    saveError.value =
      error && typeof error === 'object' && 'data' in error
        ? String((error as { data?: { message?: string } }).data?.message ?? 'Не удалось сохранить')
        : 'Не удалось сохранить'
  } finally {
    saving.value = false
  }
}

function handleKeys(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
  if (event.key === '/' && !editing) {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key === 'ArrowLeft' && !editing) {
    move(-1)
  } else if (event.key === 'ArrowRight' && !editing) {
    move(1)
  } else if (event.key === 'Enter' && !editing && selectedSlug.value) {
    void save('confirmed')
  }
}

onMounted(async () => {
  const storedReviewer = window.localStorage.getItem('annotation-reviewer-id')
  if (storedReviewer) reviewerId.value = storedReviewer
  window.addEventListener('keydown', handleKeys)
  try {
    state.value = await $fetch<AnnotationState>('/api/annotation/state')
    const firstPending = state.value.queries.findIndex((query) => query.reviewStatus === 'pending')
    selectCurrent(firstPending >= 0 ? firstPending : 0)
  } catch {
    loadError.value = 'Не удалось прочитать data/field_mapping.tsv. Запустите страницу через npm run dev.'
  }
})

onUnmounted(() => window.removeEventListener('keydown', handleKeys))

watch(current, async () => {
  await nextTick()
  document.querySelector('.queueItem.active')?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <main class="annotationApp">
    <header class="header">
      <div>
        <p class="eyebrow">Своё Вино · field annotation</p>
        <h1>Разметка реальных фото</h1>
      </div>
      <div v-if="state" class="progressBlock">
        <div class="progressCopy">
          <strong>{{ completed }} / {{ state.queries.length }}</strong>
          <span>осталось {{ pending }}</span>
        </div>
        <div class="progressTrack" aria-hidden="true">
          <span :style="{ width: `${progress}%` }" />
        </div>
      </div>
      <label class="reviewer">
        <span>Разметчик</span>
        <input v-model="reviewerId" maxlength="40" autocomplete="off" />
      </label>
    </header>

    <div v-if="loadError" class="fatal">{{ loadError }}</div>

    <div v-else-if="!state || !current" class="loading">Загружаем 100 фотографий…</div>

    <div v-else class="workspace">
      <aside class="queue" aria-label="Очередь фотографий">
        <div class="queueHead">
          <strong>Фото</strong>
          <label>
            <input v-model="showCompleted" type="checkbox" />
            готовые
          </label>
        </div>
        <button
          v-for="entry in visibleQueryIndexes"
          :key="entry.query.queryId"
          type="button"
          class="queueItem"
          :class="{
            active: entry.index === currentIndex,
            done: entry.query.reviewStatus !== 'pending',
          }"
          @click="selectCurrent(entry.index)"
        >
          <span>{{ String(entry.index + 1).padStart(3, '0') }}</span>
          <i aria-hidden="true" />
        </button>
      </aside>

      <section class="photoPanel">
        <div class="photoMeta">
          <div>
            <span class="counter">Фото {{ currentIndex + 1 }} из {{ state.queries.length }}</span>
            <strong>{{ current.fileName }}</strong>
          </div>
          <div class="photoControls">
            <button type="button" aria-label="Предыдущее фото" @click="move(-1)">←</button>
            <button type="button" aria-label="Следующее фото" @click="move(1)">→</button>
            <label>
              Масштаб
              <input v-model.number="zoom" type="range" min="1" max="2.5" step="0.1" />
            </label>
          </div>
        </div>
        <div class="photoStage">
          <img
            :key="current.queryId"
            :src="`/api/annotation/image/${current.queryId}`"
            :alt="`Полевая фотография ${current.fileName}`"
            :style="{ transform: `scale(${zoom})` }"
          />
        </div>
        <div class="secondaryActions">
          <button type="button" :disabled="saving" @click="save('not_in_catalog')">
            Нет в каталоге
          </button>
          <button type="button" :disabled="saving" @click="save('uncertain')">Не уверен</button>
          <button type="button" :disabled="saving" @click="save('exclude')">Исключить фото</button>
        </div>
      </section>

      <section class="catalogPanel">
        <div class="searchBlock">
          <label for="catalog-search">Поиск по полному каталогу</label>
          <div class="searchInput">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
              <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" />
            </svg>
            <input
              id="catalog-search"
              ref="searchInput"
              v-model="search"
              type="search"
              placeholder="Название, винодельня, сорт, регион…"
              autocomplete="off"
            />
            <kbd>/</kbd>
          </div>
          <p>
            Найдено {{ filteredCatalog.total }} · показано
            {{ filteredCatalog.visible.length }} из {{ state.catalog.length }} SKU
          </p>
        </div>

        <div class="tableWrap">
          <table>
            <thead>
              <tr>
                <th aria-label="Выбор" />
                <th>Этикетка</th>
                <th>Вино</th>
                <th>Винодельня</th>
                <th>Категория</th>
                <th>Регион / сорт</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="wine in filteredCatalog.visible"
                :key="wine.slug"
                :class="{ selected: selectedSlug === wine.slug }"
                @click="selectedSlug = wine.slug"
                @dblclick="save('confirmed')"
              >
                <td>
                  <input
                    v-model="selectedSlug"
                    type="radio"
                    name="wine"
                    :value="wine.slug"
                    :aria-label="`Выбрать ${wine.wineName}`"
                  />
                </td>
                <td class="referenceCell">
                  <img
                    v-if="wine.hasReference"
                    :src="`/api/annotation/reference/${wine.slug}`"
                    alt=""
                    loading="lazy"
                  />
                  <span v-else>—</span>
                </td>
                <td>
                  <strong>{{ wine.wineName }}</strong>
                  <small>{{ wine.slug }}</small>
                </td>
                <td>{{ wine.winery || '—' }}</td>
                <td>
                  {{ wine.category || '—' }}
                  <span :class="['galleryState', wine.galleryState]">
                    {{ wine.galleryState === 'indexed' ? 'в индексе' : 'не индексируется' }}
                  </span>
                </td>
                <td>{{ [wine.region, wine.grape].filter(Boolean).join(' · ') || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="confirmBar">
          <div class="selection">
            <template v-if="selectedWine">
              <span>Выбрано</span>
              <strong>{{ selectedWine.wineName }}</strong>
              <small>{{ selectedWine.winery }}</small>
            </template>
            <span v-else>Выберите строку в каталоге</span>
          </div>
          <div class="saveFeedback" aria-live="polite">
            <span v-if="saveError" class="error">{{ saveError }}</span>
            <span v-else-if="savedMessage" class="success">{{ savedMessage }}</span>
          </div>
          <button
            type="button"
            class="confirm"
            :disabled="!selectedSlug || saving"
            @click="save('confirmed')"
          >
            {{ saving ? 'Сохраняем…' : 'Подтвердить соответствие' }}
            <kbd>Enter</kbd>
          </button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.annotationApp {
  min-height: 100dvh;
  background: #f5f1eb;
  color: #26211e;
}

.header {
  height: 82px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 360px) minmax(180px, 240px);
  align-items: center;
  gap: 32px;
  padding: 12px 28px;
  border-bottom: 1px solid #ddd5cc;
  background: #fffdf9;
}

.eyebrow {
  margin: 0 0 2px;
  color: #8f3d42;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 25px;
}

.progressBlock {
  display: grid;
  gap: 6px;
}

.progressCopy {
  display: flex;
  justify-content: space-between;
  color: #746d67;
  font-size: 13px;
}

.progressCopy strong {
  color: #2c2a28;
  font-size: 14px;
}

.progressTrack {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e9e2da;
}

.progressTrack span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #8f3d42;
  transition: width 0.25s ease;
}

.reviewer {
  display: grid;
  gap: 4px;
  color: #746d67;
  font-size: 12px;
}

.reviewer input,
.searchInput input {
  min-width: 0;
  border: 1px solid #cfc7bf;
  border-radius: 10px;
  background: #fff;
  font: inherit;
}

.reviewer input {
  height: 36px;
  padding: 0 11px;
  color: #2c2a28;
  font-size: 14px;
}

.workspace {
  height: calc(100dvh - 82px);
  display: grid;
  grid-template-columns: 58px minmax(360px, 42vw) minmax(600px, 1fr);
  overflow: hidden;
}

.queue {
  overflow-y: auto;
  border-right: 1px solid #ddd5cc;
  background: #ece5dc;
}

.queueHead {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  gap: 4px;
  padding: 9px 7px;
  background: #ece5dc;
  color: #6f6863;
  font-size: 10px;
  text-align: center;
}

.queueHead label {
  display: grid;
  justify-items: center;
  line-height: 1;
}

.queueItem {
  width: 100%;
  min-height: 41px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-left: 3px solid transparent;
  color: #786f68;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.queueItem i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c2b9b0;
}

.queueItem.done i {
  background: #3f8b63;
}

.queueItem.active {
  border-left-color: #8f3d42;
  background: #fffdf9;
  color: #2c2a28;
  font-weight: 700;
}

.photoPanel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 18px;
  border-right: 1px solid #ddd5cc;
  background: #f7f3ee;
}

.photoMeta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 13px;
}

.photoMeta > div:first-child {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.photoMeta strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.counter {
  color: #746d67;
  font-size: 12px;
}

.photoControls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.photoControls button,
.secondaryActions button {
  border: 1px solid #d6cec6;
  background: #fff;
}

.photoControls button {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  font-size: 18px;
}

.photoControls label {
  display: grid;
  gap: 1px;
  color: #746d67;
  font-size: 10px;
}

.photoControls input {
  width: 88px;
}

.photoStage {
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  border-radius: 16px;
  background:
    radial-gradient(circle at 50% 20%, rgb(255 255 255 / 7%), transparent 34%), #211c19;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.photoStage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
  transition: transform 0.15s ease;
}

.secondaryActions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
}

.secondaryActions button {
  flex: 1;
  min-height: 38px;
  padding: 7px 10px;
  border-radius: 10px;
  color: #655e59;
  font-size: 12px;
}

.catalogPanel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #fff;
}

.searchBlock {
  padding: 17px 20px 12px;
  border-bottom: 1px solid #e5dfd8;
}

.searchBlock > label {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 700;
}

.searchInput {
  height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 11px;
  border: 1px solid #cfc7bf;
  border-radius: 11px;
  color: #8b837c;
}

.searchInput:focus-within {
  border-color: #8f3d42;
  box-shadow: 0 0 0 3px rgb(143 61 66 / 10%);
}

.searchInput input {
  flex: 1;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  color: #2c2a28;
  font-size: 15px;
}

kbd {
  padding: 1px 6px;
  border: 1px solid #ddd5cc;
  border-radius: 5px;
  background: #f7f3ee;
  color: #746d67;
  font: 11px var(--font-sans);
}

.searchBlock p {
  margin: 6px 0 0;
  color: #837b75;
  font-size: 11px;
}

.tableWrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

thead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f7f3ee;
}

th {
  padding: 8px 9px;
  color: #746d67;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.03em;
  text-align: left;
  text-transform: uppercase;
}

td {
  padding: 7px 9px;
  border-top: 1px solid #eee9e4;
  vertical-align: middle;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: #fbf7f2;
}

tbody tr.selected {
  background: #f9ecec;
  box-shadow: inset 3px 0 #8f3d42;
}

td strong,
td small {
  display: block;
}

td strong {
  font-size: 12px;
  line-height: 1.25;
}

td small {
  max-width: 230px;
  overflow: hidden;
  margin-top: 2px;
  color: #8b837c;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.referenceCell {
  width: 44px;
  text-align: center;
}

.referenceCell img {
  width: 30px;
  height: 42px;
  object-fit: contain;
}

.galleryState {
  width: max-content;
  display: block;
  margin-top: 3px;
  padding: 1px 5px;
  border-radius: 999px;
  background: #f1eeea;
  color: #786f68;
  font-size: 9px;
}

.galleryState.indexed {
  background: #e7f3eb;
  color: #28714c;
}

.confirmBar {
  min-height: 84px;
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  border-top: 1px solid #ddd5cc;
  background: #fffdf9;
  box-shadow: 0 -8px 28px rgb(55 42 32 / 7%);
}

.selection {
  min-width: 0;
  display: grid;
  color: #746d67;
  font-size: 11px;
}

.selection strong,
.selection small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection strong {
  color: #2c2a28;
  font-size: 13px;
}

.saveFeedback {
  font-size: 11px;
}

.error {
  color: #a72f37;
}

.success {
  color: #28714c;
}

.confirm {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-radius: 11px;
  background: #8f3d42;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.confirm:disabled,
.secondaryActions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.confirm kbd {
  border-color: rgb(255 255 255 / 28%);
  background: rgb(255 255 255 / 12%);
  color: #fff;
}

.loading,
.fatal {
  min-height: calc(100dvh - 82px);
  display: grid;
  place-items: center;
  padding: 32px;
}

.fatal {
  color: #a72f37;
}

@media (width <= 1100px) {
  .workspace {
    grid-template-columns: 48px minmax(330px, 38vw) minmax(500px, 1fr);
  }

  .header {
    grid-template-columns: 1fr 280px 190px;
  }

  th:nth-child(5),
  td:nth-child(5) {
    display: none;
  }
}

@media (width <= 800px) {
  .header {
    height: auto;
    grid-template-columns: 1fr 160px;
    gap: 12px;
  }

  .progressBlock {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .workspace {
    height: auto;
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .queue {
    display: none;
  }

  .photoPanel {
    height: 70dvh;
    border-right: 0;
    border-bottom: 1px solid #ddd5cc;
  }

  .catalogPanel {
    height: 78dvh;
  }

  .confirmBar {
    grid-template-columns: 1fr;
  }

  .saveFeedback {
    min-height: 16px;
  }
}
</style>
