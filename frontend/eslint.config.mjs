import prettier from 'eslint-config-prettier'

import withNuxt from './.nuxt/eslint.config.mjs'

/**
 * Направление зависимостей: app → pages → widgets → features → entities → shared.
 * Проверяем import/no-restricted-paths с зонами: правило резолвит путь и ловит
 * в том числе относительные импорты вида ../../features/x, тогда как
 * no-restricted-imports смотрит только на строку.
 *
 * Слои живут внутри app/, потому что это srcDir Nuxt. Слой «app» из FSD —
 * это корневые файлы Nuxt: app.vue, layouts/, assets/, plugins/.
 */
const LAYERS = ['pages', 'widgets', 'features', 'entities', 'shared']

const zones = LAYERS.flatMap((layer, index) =>
  LAYERS.slice(0, index).map((higher) => ({
    target: `./app/${layer}`,
    from: `./app/${higher}`,
    message: `Слой «${layer}» не может импортировать из «${higher}»: зависимости идут только вниз (app → ${LAYERS.join(' → ')}).`,
  })),
)

// Скриптам сборки доступен только слой shared.
const scriptZones = LAYERS.filter((layer) => layer !== 'shared').map((layer) => ({
  target: './scripts',
  from: `./app/${layer}`,
  message: 'Скриптам сборки доступен только слой shared.',
}))

export default withNuxt(
  {
    ignores: ['.nuxt', '.output', 'dist', 'node_modules', 'public/data', 'public/img'],
  },
  {
    files: ['app/**/*.{ts,vue}', 'scripts/**/*.ts', 'server/**/*.ts'],
    // Плагин import приносит сам @nuxt/eslint — второй экземпляр регистрировать нельзя.
    rules: {
      'import/no-restricted-paths': ['error', { zones: [...zones, ...scriptZones] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'vue/multi-word-component-names': 'off',
    },
  },
  prettier,
)
