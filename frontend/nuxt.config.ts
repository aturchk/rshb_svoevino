// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  modules: ['@nuxt/eslint'],

  /**
   * Автоимпорт компонентов выключен намеренно.
   *
   * Проект следует Feature-Sliced: app → pages → widgets → features → entities → shared,
   * и направление зависимостей проверяется линтером по реальным импортам. Автоимпорт
   * делает эти связи невидимыми — проверять становится нечего, а срез перестаёт иметь
   * публичную границу. Встроенные композаблы Nuxt (useState, useRoute, navigateTo)
   * автоимпортируются как обычно: это API фреймворка, а не наши слои.
   */
  components: { dirs: [] },
  imports: { dirs: [] },

  css: ['~/assets/styles/global.css'],

  runtimeConfig: {
    public: {
      /**
       * История сканирования по умолчанию пуста: показывать выдуманные записи
       * как настоящие нельзя. Демо-данные включаются явно и помечаются в UI.
       * NUXT_PUBLIC_MOCK_SCAN_HISTORY=true
       */
      mockScanHistory: false,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Своё Вино — сканер',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#fefdfa' },
        {
          name: 'description',
          content:
            'Сканер российских вин платформы «Своё Вино»: наведите камеру на этикетку и получите карточку вина.',
        },
      ],
    },
  },

  typescript: {
    strict: true,
    typeCheck: true,
  },

  nitro: {
    // Сгенерированные JSON и картинки отдаются как статика с длинным кэшем:
    // имя файла меняется только вместе с содержимым каталога.
    routeRules: {
      '/data/**': { headers: { 'cache-control': 'public, max-age=3600' } },
      '/img/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    },
  },
})
