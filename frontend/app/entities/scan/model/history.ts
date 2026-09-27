import type { ScanHistoryItem } from './types'

/**
 * История сканирования на устройстве. localStorage, а не сервер: аккаунтов в модуле
 * нет, а история — личное. Хранится последние 30 записей; миниатюры жмутся заранее
 * (normalizeImage), чтобы уложиться в квоту хранилища с большим запасом.
 */
const KEY = 'svoe-vino:scan-history:v1'
const LIMIT = 30

function read(): ScanHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as ScanHistoryItem[]) : []
  } catch {
    // Приватный режим Safari или битые данные — начинаем с чистого листа.
    return []
  }
}

function write(items: ScanHistoryItem[]): ScanHistoryItem[] {
  let next = items.slice(0, LIMIT)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
      return next
    } catch {
      // Квота: сначала жертвуем миниатюрами старых записей, потом самими записями.
      next =
        attempt === 0
          ? next.map((item, index) => (index < 5 ? item : { ...item, thumbnailDataUrl: null }))
          : next.slice(0, Math.ceil(next.length / 2))
    }
  }
  return next
}

export function useScanHistory() {
  // useState — одно состояние на приложение: экран сканера и /history видят одно и то же.
  const items = useState<ScanHistoryItem[]>('scan-history', () => [])
  const loaded = useState('scan-history-loaded', () => false)

  function load() {
    if (!import.meta.client || loaded.value) return
    items.value = read()
    loaded.value = true
  }

  function add(item: ScanHistoryItem) {
    load()
    items.value = write([item, ...items.value.filter((entry) => entry.id !== item.id)])
  }

  function update(id: string, patch: Partial<ScanHistoryItem>) {
    load()
    items.value = write(items.value.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function remove(id: string) {
    load()
    items.value = write(items.value.filter((item) => item.id !== id))
  }

  function clear() {
    items.value = write([])
  }

  return { items, loaded, load, add, update, remove, clear }
}
