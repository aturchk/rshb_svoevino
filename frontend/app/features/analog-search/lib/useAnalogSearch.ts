import { ref, shallowRef } from 'vue'
import type { Ref } from 'vue'

import type { SimilarWine } from '@/entities/wine'
import { API } from '@/shared/config/api'

/**
 * «Вина нет в каталоге — подберём похожее»: пользователь знает о бутылке в руке
 * хотя бы цвет и сахар, этого хватает, чтобы предложить аналоги других виноделен.
 */
export const ANALOG_COLORS = [
  { label: 'Красное', category: 'Красное', sparkling: false },
  { label: 'Белое', category: 'Белое', sparkling: false },
  { label: 'Розовое', category: 'Розовое', sparkling: false },
  { label: 'Игристое', category: 'Белое', sparkling: true },
] as const

export const ANALOG_STYLES = ['Сухое', 'Полусухое', 'Полусладкое', 'Сладкое'] as const

export type AnalogColor = (typeof ANALOG_COLORS)[number]['label']
export type AnalogStyle = (typeof ANALOG_STYLES)[number]

export function useAnalogSearch(initial: Ref<SimilarWine[]>) {
  const color = ref<AnalogColor | null>(null)
  const style = ref<AnalogStyle | null>(null)
  const wines = shallowRef<SimilarWine[]>(initial.value)
  const pending = ref(false)
  const failed = ref(false)
  let controller: AbortController | null = null

  async function search() {
    if (!color.value && !style.value) {
      wines.value = initial.value
      return
    }
    const preset = ANALOG_COLORS.find((item) => item.label === color.value)
    // У игристых «сухое» по ГОСТ — это брют и экстра брют в обиходе покупателя.
    const styleParam = preset?.sparkling && style.value === 'Сухое' ? 'Брют' : style.value
    controller?.abort()
    controller = new AbortController()
    pending.value = true
    failed.value = false
    try {
      wines.value = await $fetch<SimilarWine[]>(API.analogs, {
        query: {
          category: preset?.category,
          sparkling: preset ? (preset.sparkling ? '1' : '0') : undefined,
          style: styleParam ?? undefined,
          limit: 6,
        },
        signal: controller.signal,
      })
    } catch (cause: unknown) {
      if ((cause as Error | null)?.name !== 'AbortError') failed.value = true
    } finally {
      pending.value = false
    }
  }

  function toggleColor(value: AnalogColor) {
    color.value = color.value === value ? null : value
    void search()
  }

  function toggleStyle(value: AnalogStyle) {
    style.value = style.value === value ? null : value
    void search()
  }

  return { color, style, wines, pending, failed, toggleColor, toggleStyle }
}
