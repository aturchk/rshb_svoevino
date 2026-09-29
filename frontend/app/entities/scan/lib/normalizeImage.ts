/**
 * Первый шаг пайплайна распознавания — на телефоне, до отправки.
 *
 * Снимок из галереи весит 3–6 МБ и часто повёрнут через EXIF. Отправлять его как есть —
 * лишние секунды на мобильной сети при SLA в 3 секунды. Здесь фото разворачивается
 * по EXIF (браузер делает это сам при декодировании в <img>), уменьшается до 1280 px
 * по длинной стороне и пережимается в JPEG: ~150–300 КБ. Модели эмбеддингов (SigLIP)
 * всё равно работают на 224–512 px, так что точность от этого не страдает.
 */
const MAX_SIDE = 1280
const QUALITY = 0.86
const THUMB_SIDE = 160
const THUMB_QUALITY = 0.72

export interface NormalizedImage {
  blob: Blob
  /** Миниатюра для истории сканирования: data URL ~5–8 КБ. */
  thumbnail: string
  width: number
  height: number
}

async function decode(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    // После decode() пиксели уже в памяти, URL больше не нужен.
    URL.revokeObjectURL(url)
  }
}

function draw(image: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas недоступен')
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сжать фото'))),
      'image/jpeg',
      quality,
    ),
  )
}

export async function normalizeImage(source: Blob): Promise<NormalizedImage> {
  const image = await decode(source)
  const canvas = draw(image, MAX_SIDE)
  const thumbnail = draw(image, THUMB_SIDE).toDataURL('image/jpeg', THUMB_QUALITY)
  return {
    blob: await toBlob(canvas, QUALITY),
    thumbnail,
    width: canvas.width,
    height: canvas.height,
  }
}
