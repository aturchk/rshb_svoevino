/**
 * Публичная точка входа среза. Тяжёлое (загрузка датасета, движок запросов)
 * сюда намеренно не реэкспортируется — иначе barrel утянет их туда,
 * где нужны только типы.
 */
export type {
  AnalogQuery,
  FacetCounts,
  FacetKey,
  QueryResult,
  SimilarWine,
  SimilarWinesProvider,
  Wine,
  WineCard,
  WineIndex,
  WineQuery,
  WineSummary,
} from './model/types'
export { EMPTY_QUERY, STYLE_UNKNOWN } from './model/types'
