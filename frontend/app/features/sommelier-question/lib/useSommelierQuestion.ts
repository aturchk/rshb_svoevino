import { computed, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

import { sommelier } from '@/entities/pairing/api/sommelier'
import type { FoodGroupId, FoodVerdict, PairingTraits, SommelierAnswer } from '@/entities/pairing'
import { haptic } from '@/shared/lib/haptics'

/**
 * «Что у вас на ужин?» — вопрос сомелье, который возвращает пользователя к карточке.
 * Вердикт считается на месте и появляется мгновенно; вина, которые подойдут лучше,
 * подтягиваются с бэкенда, только когда текущее вино подходит плохо.
 * Если на сервере подключена LLM, её вердикт заменяет вердикт правил.
 */
export function useSommelierQuestion(slug: Ref<string>, traits: Ref<PairingTraits>) {
  const selected = ref<FoodGroupId | null>(null)
  const answer = shallowRef<SommelierAnswer | null>(null)
  const pending = ref(false)
  const failed = ref(false)
  let controller: AbortController | null = null

  const localVerdict = computed<FoodVerdict | null>(() =>
    selected.value ? sommelier.verdict(traits.value, selected.value) : null,
  )
  const verdict = computed(() =>
    answer.value && answer.value.source !== 'rules' ? answer.value.verdict : localVerdict.value,
  )
  const alternatives = computed(() => answer.value?.alternatives ?? [])

  async function fetchAlternatives(group: FoodGroupId) {
    controller?.abort()
    controller = new AbortController()
    pending.value = true
    failed.value = false
    try {
      answer.value = await sommelier.ask(slug.value, group, controller.signal)
    } catch (cause: unknown) {
      if ((cause as Error | null)?.name === 'AbortError') return
      failed.value = true
    } finally {
      pending.value = false
    }
  }

  function select(group: FoodGroupId) {
    haptic('tap')
    if (selected.value === group) {
      // Повторный тап снимает вопрос — как у любого переключателя.
      selected.value = null
      answer.value = null
      controller?.abort()
      return
    }
    selected.value = group
    answer.value = null
    if (localVerdict.value?.suggestAlternatives) void fetchAlternatives(group)
  }

  function retry() {
    if (selected.value) void fetchAlternatives(selected.value)
  }

  // Другое вино — другой разговор.
  watch(slug, () => {
    controller?.abort()
    selected.value = null
    answer.value = null
  })

  return { selected, verdict, alternatives, pending, failed, select, retry }
}
