<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TypeDesigner from './features/type-designer/TypeDesigner.vue';

const { t } = useI18n();
</script>

<template>
  <main class="app">
    <header class="app__header">
      <h1>{{ t('app.title') }}</h1>
      <p>{{ t('app.tagline') }}</p>
    </header>

    <TypeDesigner />
  </main>
</template>
