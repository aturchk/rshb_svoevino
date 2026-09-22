import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Алиас зеркалит paths из tsconfig.app.json. Отдельный плагин
// vite-tsconfig-paths не нужен — это три строки и на одну зависимость меньше.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Смотрим на вес главного чанка: цель — держать его компактным.
    chunkSizeWarningLimit: 200,
  },
  test: {
    // Тесты только на чистые функции: ни jsdom, ни testing-library не нужны.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
