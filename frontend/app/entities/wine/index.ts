/**
 * Публичная точка входа среза. Тяжёлое (загрузка датасета, движок запросов)
 * сюда намеренно не реэкспортируется — иначе barrel утянет их туда,
 * где нужны только типы.
 */
export type {
  FacetCounts,
  FacetKey,
  QueryResult,
  Wine,
  WineIndex,
  WineQuery,
} from './model/types'
export { EMPTY_QUERY, STYLE_UNKNOWN } from './model/types'
