<script setup lang="ts">
import { ROUTES } from '@/shared/config/routes'

/**
 * Титульного экрана нет намеренно: он дублировал обещание сканера, а его
 * единственная кнопка вела туда же, куда таб-бар. На мобильном приоритете
 * это экран-прокладка между пользователем и основным действием продукта.
 */
await navigateTo(ROUTES.scan, { redirectCode: 302 })
</script>

<template>
  <div />
</template>
