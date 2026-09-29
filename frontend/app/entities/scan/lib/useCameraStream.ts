import { onBeforeUnmount, ref, shallowRef } from 'vue'

/**
 * Живой видоискатель камеры.
 *
 * Два правила, из-за которых на телефоне обычно всё ломается:
 *  1. getUserMedia работает только в защищённом контексте. По http с IP в локальной
 *     сети камеры не будет никогда — это не ошибка кода, и пользователю надо сказать
 *     именно это, а не «не удалось получить доступ».
 *  2. Запрашивать доступ можно только по жесту пользователя. Вызов на монтировании
 *     в лучшем случае игнорируется, в худшем — сразу получает отказ, который
 *     браузер запомнит, а на iOS снять его можно только через системные настройки.
 */
export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'denied'
  | 'not-found'
  | 'busy'
  | 'insecure'
  | 'unsupported'
  | 'error'

const CONSTRAINTS: MediaStreamConstraints = {
  // Только ideal. С exact запрос падает OverconstrainedError на ноутбуке без
  // задней камеры и на части Android-прошивок, где фронталка была бы приемлема.
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 720 },
    height: { ideal: 1280 },
    frameRate: { ideal: 24, max: 30 },
  },
  audio: false,
}

function classify(error: unknown): CameraStatus {
  if (!(error instanceof Error)) return 'error'
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
      return 'not-found'
    // Камеру уже занял другой процесс — на Android это обычное дело.
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'error'
  }
}

/** Фонарик: MediaTrackCapabilities.torch есть в Chrome на Android, в Safari — нет. */
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean
}

export function useCameraStream() {
  const status = ref<CameraStatus>('idle')
  const video = ref<HTMLVideoElement | null>(null)
  const stream = shallowRef<MediaStream | null>(null)
  const torchSupported = ref(false)
  const torchOn = ref(false)
  /** Счётчик запросов: ответ устаревшего вызова не должен перетирать актуальный. */
  let requestId = 0

  function stop() {
    requestId += 1
    if (stream.value) {
      // Треки надо гасить явно: иначе на телефоне продолжает гореть индикатор
      // камеры и садится батарея, даже когда видоискатель убран.
      for (const track of stream.value.getTracks()) track.stop()
      stream.value = null
    }
    if (video.value) video.value.srcObject = null
    torchSupported.value = false
    torchOn.value = false
    if (status.value === 'streaming' || status.value === 'requesting') status.value = 'idle'
  }

  async function attach(media: MediaStream, id: number): Promise<void> {
    if (id !== requestId) {
      for (const track of media.getTracks()) track.stop()
      return
    }
    const track = media.getVideoTracks().at(0)
    if (!track) {
      for (const item of media.getTracks()) item.stop()
      status.value = 'error'
      return
    }
    // Android отбирает камеру у фоновой вкладки и глушит трек — это не ошибка
    // запроса, а потеря устройства уже после выдачи доступа.
    track.addEventListener('ended', () => {
      stop()
      status.value = 'busy'
    })

    stream.value = media
    // getCapabilities отсутствует в старых Firefox — фонарика там просто не будет.
    const capabilities = (track.getCapabilities?.() ?? {}) as TorchCapabilities
    torchSupported.value = capabilities.torch === true
    if (video.value) {
      video.value.srcObject = media
      // play() может отклониться, если элемент успели размонтировать.
      await video.value.play().catch(() => undefined)
    }
    status.value = 'streaming'
  }

  async function start(): Promise<void> {
    if (!import.meta.client) return
    if (!window.isSecureContext) {
      status.value = 'insecure'
      return
    }
    // В Safari по http сам объект mediaDevices отсутствует, и обращение
    // к navigator.mediaDevices.getUserMedia уронило бы TypeError.
    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'unsupported'
      return
    }
    if (stream.value) return

    const id = ++requestId
    status.value = 'requesting'

    try {
      await attach(await navigator.mediaDevices.getUserMedia(CONSTRAINTS), id)
    } catch (cause: unknown) {
      if (id !== requestId) return
      // Задняя камера и разрешение — пожелания, а не требование: если железо
      // не смогло, пробуем любую камеру и только потом сдаёмся.
      if (cause instanceof Error && cause.name === 'OverconstrainedError') {
        try {
          await attach(await navigator.mediaDevices.getUserMedia({ video: true }), id)
          return
        } catch {
          status.value = 'error'
          return
        }
      }
      status.value = classify(cause)
    }
  }

  async function setTorch(on: boolean): Promise<void> {
    const track = stream.value?.getVideoTracks().at(0)
    if (!track || !torchSupported.value) return
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      torchOn.value = on
    } catch {
      // Часть прошивок заявляет torch, но включить его не даёт.
      torchSupported.value = false
      torchOn.value = false
    }
  }

  /** Полный кадр камеры: бутылка и её края не должны теряться при съёмке. */
  async function capture(quality = 0.9): Promise<Blob | null> {
    const element = video.value
    if (!element || status.value !== 'streaming' || !element.videoWidth) return null
    const sourceWidth = element.videoWidth
    const sourceHeight = element.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = sourceWidth
    canvas.height = sourceHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(element, 0, 0, sourceWidth, sourceHeight)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  }

  if (import.meta.client) {
    // Вкладка ушла в фон — гасим камеру; вернулась — включаем снова, если она работала.
    // Разрешение к этому моменту уже выдано, поэтому повторного вопроса не будет.
    let resumeOnVisible = false
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        resumeOnVisible = status.value === 'streaming'
        stop()
      } else if (resumeOnVisible) {
        resumeOnVisible = false
        void start()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    // iOS Safari при уходе в BFCache не всегда шлёт visibilitychange.
    window.addEventListener('pagehide', stop)
    onBeforeUnmount(() => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stop)
      stop()
    })
  }

  return { status, video, start, stop, capture, torchSupported, torchOn, setTorch }
}
