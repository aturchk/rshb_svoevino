import { forwardRef, useEffect, useRef } from 'react'

import type { CameraStatus } from '@/entities/scan/lib/useCameraStream'
import { useCameraStream } from '@/entities/scan/lib/useCameraStream'
import { useSwipeUp } from '@/features/scan-toggle/lib/useSwipeCollapse'
import { cx } from '@/shared/lib/cx'
import { Button } from '@/shared/ui/Button'

import styles from './ScannerPanel.module.css'

interface ScannerPanelProps {
  collapsed: boolean
  onCollapse: () => void
  id: string
}

/** Что говорим пользователю в каждом состоянии доступа. «Не работает» — не ответ. */
const STATE_TEXT: Record<Exclude<CameraStatus, 'streaming'>, string> = {
  idle: 'Мы покажем изображение с камеры, чтобы вы навели её на этикетку.',
  requesting: 'Ждём разрешения на доступ к камере…',
  denied:
    'Доступ к камере запрещён. Разрешите его в настройках сайта в адресной строке браузера и попробуйте снова.',
  'not-found': 'Камера не найдена. Похоже, на этом устройстве её нет.',
  busy: 'Камера занята другим приложением. Закройте его и попробуйте снова.',
  insecure:
    'Камера доступна только на защищённом соединении. Откройте сайт по https — по обычному http браузер её не даст.',
  unsupported: 'Этот браузер не умеет показывать камеру. Попробуйте Safari или Chrome.',
  error: 'Не удалось включить камеру. Попробуйте ещё раз.',
}

/**
 * Модуль сканирования: живой видоискатель.
 * Распознавания этикетки пока нет — шов под него в entities/scan/api/recognizeWine.ts.
 */
export const ScannerPanel = forwardRef<HTMLDivElement, ScannerPanelProps>(
  function ScannerPanel({ collapsed, onCollapse, id }, ref) {
    const { status, videoRef, start, stop } = useCameraStream()
    const wasStreaming = useRef(false)
    const swipe = useSwipeUp(onCollapse, !collapsed)

    // Панель свернули — гасим поток, чтобы на телефоне не горел индикатор камеры.
    // При развороте возвращаем его сам: разворот всегда происходит по жесту
    // пользователя, поэтому повторного запроса разрешения не будет.
    useEffect(() => {
      if (collapsed) {
        wasStreaming.current = status === 'streaming'
        stop()
      } else if (wasStreaming.current) {
        wasStreaming.current = false
        start()
      }
      // Намеренно не следим за status: иначе остановка сама себя перезапустит.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed, start, stop])

    const live = status === 'streaming'

    return (
      <div ref={ref} id={id} className={cx(styles.panel, collapsed && styles.hidden)} inert={collapsed} {...swipe}>
        <div className={styles.inner}>
          <span className={styles.handle} aria-hidden="true" />

          <div className={styles.stage}>
            {/* playsInline обязателен: без него iOS Safari уводит видео
                в полноэкранный плеер и панель схлопывается впустую. */}
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              autoPlay
              aria-label="Изображение с камеры"
              style={{ display: live ? 'block' : 'none' }}
            />

            <span className={cx(styles.corner, styles.tl, !live && styles.cornerIdle)} />
            <span className={cx(styles.corner, styles.tr, !live && styles.cornerIdle)} />
            <span className={cx(styles.corner, styles.bl, !live && styles.cornerIdle)} />
            <span className={cx(styles.corner, styles.br, !live && styles.cornerIdle)} />

            {!live && (
              <div className={styles.state}>
                {status === 'requesting' ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : (
                  <svg
                    className={styles.placeholder}
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
                <p className={styles.stateText}>{STATE_TEXT[status]}</p>
                {(status === 'idle' || status === 'denied' || status === 'busy' || status === 'error') && (
                  <Button size="sm" onClick={start}>
                    {status === 'idle' ? 'Включить камеру' : 'Попробовать снова'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className={styles.caption}>
            <span className={styles.badge}>Распознавание в разработке</span>
            <span className={styles.hint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Смахните вверх, чтобы свернуть
            </span>
          </div>
        </div>
      </div>
    )
  },
)
