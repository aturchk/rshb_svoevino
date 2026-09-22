/**
 * Склейка классов. Нужна из-за noUncheckedIndexedAccess: обращение к классу
 * CSS-модуля даёт string | undefined, и разбрасывать `?? ''` по разметке не хочется.
 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
