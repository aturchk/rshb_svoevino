import { memo } from 'react'

import styles from './BottleImage.module.css'

const CATEGORY_CLASS: Record<string, string> = {
  Белое: styles.white as string,
  Красное: styles.red as string,
  Розовое: styles.rose as string,
  Оранжевое: styles.orange as string,
}

interface BottleImageProps {
  src: string | null
  /** Реальные размеры файла: нужны для точного aspect-ratio без скачка вёрстки. */
  width: number
  height: number
  alt: string
  category: string
  /** Ширина бокса в CSS-пикселях; высота считается из неё. */
  boxWidth: number
  eager?: boolean
}

/** Медиана h/w по резолвящимся фото = 3.56; для заглушки берём её же. */
const PLACEHOLDER_RATIO = 3.56

function BottleImageView({
  src,
  width,
  height,
  alt,
  category,
  boxWidth,
  eager = false,
}: BottleImageProps) {
  const ratio = src && width > 0 && height > 0 ? height / width : PLACEHOLDER_RATIO
  const boxHeight = Math.round(boxWidth * ratio)

  return (
    <span className={styles.frame} style={{ width: boxWidth, height: boxHeight }}>
      {src ? (
        <img
          className={styles.photo}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
        />
      ) : (
        <svg
          className={`${styles.placeholder} ${CATEGORY_CLASS[category] ?? ''}`}
          viewBox="0 0 28 100"
          role="img"
          aria-label={`${alt}: фотография недоступна`}
        >
          <path
            d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
            fill="currentColor"
            opacity="0.18"
          />
          <path
            d="M11 2h6v16c0 4 6 9 6 17v58a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V35c0-8 6-13 6-17V2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.5"
          />
          <rect x="6" y="48" width="16" height="26" rx="1.5" fill="currentColor" opacity="0.28" />
        </svg>
      )}
    </span>
  )
}

export const BottleImage = memo(BottleImageView)
