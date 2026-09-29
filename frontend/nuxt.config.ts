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

  /**
   * Стили компонентов — прямо в HTML серверного рендера: без этого каждый срез
   * тянет свой .css, и мелкие файлы блокируют первую отрисовку (Lighthouse: −600 мс).
   */
  features: { inlineStyles: true },

  runtimeConfig: {
    /** Internal GPU service. The browser never receives this URL. */
    ml: {
      baseUrl: 'http://127.0.0.1:8080',
      timeoutMs: 2800,
      /** Low-resource visual-hash fallback for hosts without the SigLIP service. */
      fallback: '',
    },
    /**
     * Цифровой сомелье. По умолчанию отвечают правила (entities/pairing).
     * NUXT_SOMMELIER_PROVIDER=llm и NUXT_SOMMELIER_LLM_ENDPOINT — точка подключения LLM,
     * см. server/utils/sommelier.ts. Ключ модели только на сервере, в браузер не уходит.
     */
    sommelier: {
      provider: 'rules',
      llmEndpoint: '',
      llmApiKey: '',
    },
    public: {
      /**
       * История сканирования по умолчанию пуста: показывать выдуманные записи
       * как настоящие нельзя. Демо-данные включаются явно и помечаются в UI.
       * NUXT_PUBLIC_MOCK_SCAN_HISTORY=true
       */
      mockScanHistory: false,
      /**
       * Демо-режим сканера: вместо распознавания берёт вино каталога по хэшу снимка
       * и по кругу прогоняет три исхода — найдено, не уверены, не найдено. Нужен, чтобы
       * проверить интерфейс без запущенного ML-сервиса; в UI помечен «Демо».
       * Эндпоинт скрипта оценки (/api/v1/eval/predict) его не использует.
       * NUXT_PUBLIC_DEMO_SCAN=true
       */
      demoScan: false,
      /** Show the reduced-accuracy visual-hash mode on constrained hosts. */
      liteScan: false,
    },
  },

  app: {
    /**
     * Переход между страницами — короткое проявление со сдвигом на 6 px: только
     * opacity и transform. При prefers-reduced-motion выключается в global.css.
     */
    pageTransition: { name: 'page', mode: 'out-in' },
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
            'Сканер российских вин платформы «Своё Вино»: наведите камеру на бутылку и получите карточку вина.',
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
