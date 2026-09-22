import type { FacetCounts, WineIndex, WineQuery } from '@/entities/wine'
import { STYLE_UNKNOWN } from '@/entities/wine'
import type { WineFacetsFile } from '@/shared/config/dataset-schema'
import { RangeSlider } from '@/shared/ui/RangeSlider'
import { Toggle } from '@/shared/ui/Toggle'

import { FacetGroup } from './FacetGroup'
import styles from './FilterPanel.module.css'

interface FilterPanelProps {
  index: WineIndex
  facets: WineFacetsFile
  query: WineQuery
  counts: FacetCounts
  abvDraft: [number, number] | null
  onAbvChange: (value: [number, number] | null) => void
  onAbvCommit: () => void
  onToggle: (
    facet: 'categories' | 'regions' | 'styles' | 'grapes' | 'wineries',
    value: number,
  ) => void
  onUpdate: (patch: Partial<WineQuery>) => void
}

export function FilterPanel({
  index,
  facets,
  query,
  counts,
  abvDraft,
  onAbvChange,
  onAbvCommit,
  onToggle,
  onUpdate,
}: FilterPanelProps) {
  const { dict } = index
  const abvRange = facets.ranges.abv
  const current = abvDraft ?? [abvRange.min, abvRange.max]

  // «Стиль не указан» лежит последним слотом счётчиков — это полноценное значение,
  // а не отсутствие данных: у 386 позиций стиль в названии просто не написан.
  const styleLabels = [...dict.styles, 'Не указан']
  const styleValues = [...dict.styles.map((_, i) => i), STYLE_UNKNOWN]

  return (
    <div className={styles.panel}>
      <FacetGroup
        legend="Цвет"
        labels={dict.categories}
        counts={counts.categories}
        selected={query.categories}
        onToggle={(value) => onToggle('categories', value)}
      />

      <FacetGroup
        legend="Регион"
        labels={dict.regions}
        counts={counts.regions}
        selected={query.regions}
        onToggle={(value) => onToggle('regions', value)}
      />

      <FacetGroup
        legend="Сахар"
        labels={styleLabels}
        values={styleValues}
        counts={counts.styles}
        selected={query.styles}
        onToggle={(value) => onToggle('styles', value)}
      />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Крепость</legend>
        <RangeSlider
          min={abvRange.min}
          max={abvRange.max}
          step={abvRange.step}
          from={current[0]}
          to={current[1]}
          label="Крепость"
          format={(value) => `${value.toFixed(1).replace('.0', '')} % об.`}
          onChange={(from, to) => onAbvChange([from, to])}
          onCommit={onAbvCommit}
        />
        <Toggle
          label="Показывать вина без указанной крепости"
          hint={`${facets.totals.withoutAbv} позиций`}
          checked={query.abvIncludeUnknown}
          onChange={(value) => onUpdate({ abvIncludeUnknown: value })}
        />
        <p className={styles.note}>
          Крепость восстановлена из артикула каталога и известна для{' '}
          {facets.totals.all - facets.totals.withoutAbv} вин из {facets.totals.all}.
        </p>
      </fieldset>

      <FacetGroup
        legend="Сорт винограда"
        labels={dict.grapes}
        counts={counts.grapes}
        selected={query.grapes}
        onToggle={(value) => onToggle('grapes', value)}
        searchable
        searchPlaceholder="Например, Красностоп"
      />

      <FacetGroup
        legend="Винодельня"
        labels={dict.wineries}
        counts={counts.wineries}
        selected={query.wineries}
        onToggle={(value) => onToggle('wineries', value)}
        searchable
        searchPlaceholder="Например, Фанагория"
      />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Ещё</legend>
        <div className={styles.toggles}>
          <Toggle
            label="Только игристые"
            hint={`${facets.totals.sparkling}`}
            checked={query.sparklingOnly}
            onChange={(value) => onUpdate({ sparklingOnly: value })}
          />
          <Toggle
            label="Только с фотографией"
            hint={`${facets.totals.withPhoto}`}
            checked={query.withPhotoOnly}
            onChange={(value) => onUpdate({ withPhotoOnly: value })}
          />
        </div>
      </fieldset>
    </div>
  )
}
