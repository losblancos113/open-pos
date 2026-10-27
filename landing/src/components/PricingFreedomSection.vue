<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();
</script>

<template>
  <section id="freedom" class="py-20 md:py-28 bg-bg-subtle border-t border-border">
    <div class="section-container">
      <div class="mx-auto max-w-3xl text-center mb-16">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-subtle px-3 py-1 text-xs font-semibold text-success mb-3">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {{ t.freedom.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.freedom.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted leading-relaxed">
          {{ t.freedom.subtitle }}
        </p>
      </div>

      <!-- 3 Philosophy Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div v-for="(card, idx) in t.freedom.cards" :key="idx" class="card-base p-8 bg-surface flex flex-col justify-between">
          <div>
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary font-mono text-lg font-bold mb-6">
              0{{ idx + 1 }}
            </div>
            <h3 class="text-lg font-bold text-text mb-3">
              {{ card.title }}
            </h3>
            <p class="text-xs sm:text-sm text-text-muted leading-relaxed">
              {{ card.desc }}
            </p>
          </div>

          <div class="mt-8 pt-4 border-t border-border/60 flex items-center gap-2 text-xs font-semibold text-primary">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            <span>Cam kết minh bạch 100%</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
