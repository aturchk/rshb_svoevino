import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { memo, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { WineIndex } from '@/entities/wine'
import { STYLE_UNKNOWN } from '@/entities/wine'
import { IMG_THUMB } from '@/shared/config/dataset-schema'
import { ROW_HEIGHT_DESKTOP, ROW_HEIGHT_MOBILE, VIRTUAL_OVERSCAN } from '@/shared/config/constants'
import { wineRoute } from '@/shared/config/routes'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { BottleImage } from '@/shared/ui/BottleImage'

import { saveCatalogScroll, takeCatalogScroll } from './catalogScroll'
import styles from './CatalogList.module.css'

interface CatalogListProps {
  index: WineIndex
  ids: Uint32Array
  /** Сериализованный запрос: по нему решаем, можно ли восстановить скролл. */
  signature: string
}

interface RowProps {
  index: WineIndex
  id: number
  height: number
  thumbWidth: number
  offset: number
}

/**
 * Строка мемоизирована по id: при перерисовке контейнера (а он перерисовывается
 * на каждое нажатие в поиске) React не трогает DOM уже отрисованных строк.
 */
const Row = memo(function Row({ index, id, height, thumbWidth, offset }: RowProps) {
  const slug = index.slugs[id] as string
  const styleSlot = index.style[id] as number
  const abv = index.abv[id] as number

  const meta = [
    index.dict.wineries[index.winery[id] as number],
    index.dict.regions[index.region[id] as number],
    styleSlot === STYLE_UNKNOWN ? null : index.dict.styles[styleSlot],
    Number.isNaN(abv) ? null : `${String(abv).replace('.', ',')} %`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <Link
        to={wineRoute(slug)}
        className={styles.row}
        style={{ height, transform: `translateY(${offset}px)` }}
      >
        <span className={styles.thumb}>
          <BottleImage
            src={index.hasImage[id] === 1 ? `${import.meta.env.BASE_URL}${IMG_THUMB(slug)}` : null}
            width={index.imgWidth[id] as number}
            height={index.imgHeight[id] as number}
            alt={index.names[id] as string}
            category={index.dict.categories[index.category[id] as number] ?? ''}
            boxWidth={thumbWidth}
          />
        </span>
        <span className={styles.body}>
          <span className={styles.name}>{index.names[id]}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
        <svg className={styles.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Link>
    </li>
  )
})

export function CatalogList({ index, ids, signature }: CatalogListProps) {
  const isDesktop = useMediaQuery('(min-width: 767px)')
  const rowHeight = isDesktop ? ROW_HEIGHT_DESKTOP : ROW_HEIGHT_MOBILE
  const thumbWidth = isDesktop ? 22 : 18
  // Смещение списка от верха документа меряем колбэк-рефом: читать ref
  // во время рендера нельзя, а виртуализатору это значение нужно как вход.
  const [listTop, setListTop] = useState(0)
  const listRef = useCallback((node: HTMLUListElement | null) => {
    if (node) setListTop(node.offsetTop)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: ids.length,
    // Высота строки фиксирована, поэтому measureElement не нужен:
    // нет прохода измерений и нет дёрганья скроллбара.
    estimateSize: () => rowHeight,
    overscan: VIRTUAL_OVERSCAN,
    scrollMargin: listTop,
    // Стабильный ключ — slug, а не индекс массива: иначе при смене фильтра
    // React переиспользует DOM не тех строк.
    getItemKey: (position) => index.slugs[ids[position] as number] as string,
  })

  // Возврат с карточки вина не должен ронять пользователя в начало списка.
  useLayoutEffect(() => {
    const offset = takeCatalogScroll(signature)
    if (offset !== null) window.scrollTo({ top: offset, behavior: 'instant' })
    // Один раз при монтировании: восстанавливаем только исходную позицию.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => saveCatalogScroll(window.scrollY, signature)
  }, [signature])

  return (
    <ul ref={listRef} className={styles.list} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => (
        <Row
          key={item.key}
          index={index}
          id={ids[item.index] as number}
          height={rowHeight}
          thumbWidth={thumbWidth}
          offset={item.start - listTop}
        />
      ))}
    </ul>
  )
}
