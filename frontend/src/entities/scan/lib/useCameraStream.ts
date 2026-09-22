import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Живой видоискатель камеры.
 *
 * Два правила, из-за которых на телефоне обычно всё ломается:
 *  1. getUserMedia работает только в защищённом контексте. По http с IP в локальной
 *     сети камеры не будет никогда — это не ошибка кода, и пользователю надо сказать
 *     именно это, а не «не удалось получить доступ».
 *  2. Запрашивать доступ можно только по жесту пользователя. Вызов на монтировании
 *     в лучшем случае игнорируется, в худшем — сразу получает отказ, который
 *     браузер запомнит.
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

interface CameraState {
  status: CameraStatus
  videoRef: React.RefObject<HTMLVideoElement | null>
  start: () => void
  stop: () => void
}

/** Разбор ошибки getUserMedia в понятное пользователю состояние. */
function classify(error: unknown): CameraStatus {
  if (!(error instanceof Error)) return 'error'
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    // Камеру уже занял другой процесс — на Android это обычное дело.
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'error'
  }
}

function initialStatus(): CameraStatus {
  if (typeof window === 'undefined') return 'idle'
  if (!window.isSecureContext) return 'insecure'
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported'
  return 'idle'
}

export function useCameraStream(): CameraState {
  const [status, setStatus] = useState<CameraStatus>(initialStatus)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Счётчик запросов: ответ устаревшего вызова не должен перетирать актуальный. */
  const requestId = useRef(0)

  const stop = useCallback(() => {
    requestId.current += 1
    const stream = streamRef.current
    if (stream) {
      // Треки надо гасить явно: иначе на телефоне продолжает гореть индикатор
      // камеры и садится батарея, даже когда панель свёрнута.
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus((current) =>
      current === 'streaming' || current === 'requesting' ? 'idle' : current,
    )
  }, [])

  const start = useCallback(() => {
    if (!window.isSecureContext) {
      setStatus('insecure')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    if (streamRef.current) return

    const id = ++requestId.current
    setStatus('requesting')

    navigator.mediaDevices
      .getUserMedia({
        // ideal, а не exact: с exact на ноутбуке без задней камеры
        // запрос падает с OverconstrainedError вместо честного фолбэка.
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        if (id !== requestId.current) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          // play() может отклониться, если элемент успели размонтировать.
          void video.play().catch(() => undefined)
        }
        setStatus('streaming')
      })
      .catch((error: unknown) => {
        if (id !== requestId.current) return
        setStatus(classify(error))
      })
  }, [])

  // Вкладка ушла в фон — гасим поток. Возвращать его сами не будем:
  // это потребует нового жеста, зато индикатор камеры не висит зря.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [stop])

  useEffect(() => stop, [stop])

  return { status, videoRef, start, stop }
}
