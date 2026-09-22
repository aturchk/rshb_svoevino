/**
 * Позиция скролла каталога. Живёт в модуле, а не в сторе: это чисто
 * эфемерное состояние вида, и переживать перезагрузку страницы оно не должно.
 * Сигнатура — сериализованный запрос: при смене фильтров позицию не восстанавливаем.
 */
let saved: { offset: number; signature: string } | null = null

export function saveCatalogScroll(offset: number, signature: string): void {
  saved = { offset, signature }
}

export function takeCatalogScroll(signature: string): number | null {
  if (!saved || saved.signature !== signature) return null
  return saved.offset
}
