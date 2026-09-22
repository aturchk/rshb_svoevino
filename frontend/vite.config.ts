import { fileURLToPath } from 'node:url'

import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Камера (getUserMedia) работает только в защищённом контексте: по http
// с IP в локальной сети телефон её не даст никогда. HTTPS=1 поднимает
// самоподписанный сертификат — этого достаточно, чтобы проверить камеру
// с телефона в той же сети (браузер один раз попросит подтвердить риск).
const useHttps = process.env.HTTPS === '1'

// Алиас зеркалит paths из tsconfig.app.json. Отдельный плагин
// vite-tsconfig-paths не нужен — это три строки и на одну зависимость меньше.
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
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
