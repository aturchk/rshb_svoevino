import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Тесты только на чистых функциях: деривация полей, движок фильтрации,
 * нормализация. Ни jsdom, ни компонентного рантайма не нужно.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
