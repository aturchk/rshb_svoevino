import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * Направление зависимостей: app → pages → widgets → features → entities → shared.
 * Проверяем через import/no-restricted-paths, а не no-restricted-imports:
 * второе смотрит только на строку импорта и пропускает относительные пути
 * вида `../../features/x`, первое резолвит путь и ловит оба написания.
 */
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']

const layerZones = LAYERS.flatMap((layer, i) =>
  LAYERS.slice(0, i).map((higher) => ({
    target: `./src/${layer}`,
    from: `./src/${higher}`,
    message: `Слой "${layer}" не может импортировать из "${higher}": зависимости идут только вниз (${LAYERS.join(' → ')}).`,
  })),
)

export default tseslint.config(
  { ignores: ['dist', 'public/data', 'public/img', 'node_modules'] },

  // Приложение
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { project: ['./tsconfig.app.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.app.json' } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'import/no-restricted-paths': ['error', { zones: layerZones }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/public/data/*', '*.json'],
              message:
                'Датасет грузится через fetch по требованию, а не статическим импортом — иначе он уедет в бандл.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Скрипты сборки и тесты: нода, доступен только слой shared
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
      parserOptions: { project: ['./tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.node.json' } },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: LAYERS.filter((l) => l !== 'shared').map((layer) => ({
            target: './scripts',
            from: `./src/${layer}`,
            message: 'Скриптам сборки доступен только слой shared.',
          })),
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  prettier,
)
