import { ref, shallowRef } from 'vue'

import type { DemoScenario, RecognizeResult, RecognizeStatus } from '@/entities/scan'
import { useScanHistory } from '@/entities/scan'
import { recognizeWine, RecognizeUnavailableError } from '@/entities/scan/api/recognizeWine'
import { normalizeImage } from '@/entities/scan/lib/normalizeImage'
import { useFlags } from '@/shared/config/flags'
import { haptic } from '@/shared/lib/haptics'

/**
 * Сценарий сканирования: снимок → нормализация → распознавание → результат → история.
 *
 *  live        — камера или выбор фото, ждём снимок;
 *  processing  — снимок заморожен в видоискателе, идёт распознавание;
 *  result      — шторка с одним из трёх исходов;
 *  unavailable — распознавание не подключено (503) — это не «вино не найдено»;
 *  error       — сеть или таймаут.
 */
export type ScanPhase = 'live' | 'processing' | 'result' | 'unavailable' | 'error'

export interface ScanOutcome {
  result: RecognizeResult
  historyId: string
}

/** SLA из ТЗ — до 3 секунд; дольше 15 ждать бессмысленно, лучше честно сказать. */
const TIMEOUT_MS = 15_000
/** Порядок «авто» в демо: на показе за три снимка проходят все три исхода. */
const AUTO_ORDER: readonly RecognizeStatus[] = ['matched', 'low_confidence', 'not_found']

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`
}

export function useScanFlow() {
  const phase = ref<ScanPhase>('live')
  const outcome = shallowRef<ScanOutcome | null>(null)
  /** Снимок, замороженный в видоискателе на время распознавания. */
  const preview = ref<string | null>(null)
  const errorText = ref('')
  const flags = useFlags()
  const history = useScanHistory()
  // Сценарий демо живёт, пока открыта вкладка: переход в карточку и обратно его не сбрасывает.
  const scenario = useState<DemoScenario>('demo-scenario', () => 'auto')
  const autoStep = useState('demo-auto-step', () => 0)
  let controller: AbortController | null = null

  function takeScenario(): DemoScenario | undefined {
    if (!flags.demoScan) return undefined
    if (scenario.value !== 'auto') return scenario.value
    const value = AUTO_ORDER[autoStep.value % AUTO_ORDER.length]
    autoStep.value += 1
    return value
  }

  function releasePreview() {
    if (preview.value?.startsWith('blob:')) URL.revokeObjectURL(preview.value)
    preview.value = null
  }

  function record(result: RecognizeResult, thumbnail: string): string {
    const id = newId()
    const wine = result.card
    history.add({
      id,
      scannedAt: new Date().toISOString(),
      status: result.status,
      wineSlug: wine?.slug ?? null,
      wineName: wine?.name ?? null,
      winery: wine?.winery ?? null,
      confidence: result.top1?.score ?? null,
      thumbnailDataUrl: thumbnail,
      demo: result.demo,
    })
    return id
  }

  async function scan(source: Blob) {
    controller?.abort()
    const current = new AbortController()
    controller = current
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      current.abort()
    }, TIMEOUT_MS)

    releasePreview()
    preview.value = URL.createObjectURL(source)
    outcome.value = null
    errorText.value = ''
    phase.value = 'processing'
    haptic('tap')

    try {
      const image = await normalizeImage(source)
      if (current.signal.aborted) return
      const result = await recognizeWine(image.blob, {
        signal: current.signal,
        scenario: takeScenario(),
      })
      if (controller !== current) return
      outcome.value = { result, historyId: record(result, image.thumbnail) }
      phase.value = 'result'
      haptic(result.status === 'matched' ? 'success' : 'warning')
    } catch (cause: unknown) {
      if (controller !== current) return
      if (cause instanceof RecognizeUnavailableError) {
        phase.value = 'unavailable'
      } else if (current.signal.aborted && !timedOut) {
        // Пользователь сам отменил — возвращаемся к камере без ошибок.
        releasePreview()
        phase.value = 'live'
      } else {
        errorText.value = timedOut
          ? 'Сервис распознавания отвечает слишком долго. Попробуйте ещё раз.'
          : 'Не получилось отправить фото. Проверьте интернет и попробуйте ещё раз.'
        phase.value = 'error'
      }
      haptic('warning')
    } finally {
      window.clearTimeout(timer)
    }
  }

  /** «Это не то вино?» → пользователь выбрал правильное: запись в истории уточняется. */
  function confirm(wine: { slug: string; name: string; winery: string }) {
    if (!outcome.value) return
    history.update(outcome.value.historyId, {
      status: 'matched',
      wineSlug: wine.slug,
      wineName: wine.name,
      winery: wine.winery,
      confirmed: true,
    })
  }

  function reset() {
    controller?.abort()
    controller = null
    releasePreview()
    outcome.value = null
    errorText.value = ''
    phase.value = 'live'
  }

  function setScenario(value: DemoScenario) {
    scenario.value = value
    autoStep.value = 0
  }

  return {
    phase,
    outcome,
    preview,
    errorText,
    scenario,
    setScenario,
    scan,
    confirm,
    reset,
    cancel: reset,
  }
}
