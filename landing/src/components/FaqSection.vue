<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../i18n';

const { t } = useI18n();

const openIndex = ref<number | null>(0);

function toggle(idx: number) {
  openIndex.value = openIndex.value === idx ? null : idx;
}
</script>

<template>
  <section id="faq" class="py-20 md:py-28 bg-surface">
    <div class="section-container">
      <div class="mx-auto max-w-3xl text-center mb-16">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary mb-3">
          {{ t.faq.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.faq.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted leading-relaxed">
          {{ t.faq.subtitle }}
        </p>
      </div>

      <div class="mx-auto max-w-3xl space-y-4">
        <div
          v-for="(item, idx) in t.faq.items"
          :key="idx"
          class="rounded-xl border border-border bg-surface shadow-soft transition-all"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between p-5 text-left font-bold text-sm sm:text-base text-text hover:text-primary transition-colors"
            @click="toggle(idx)"
          >
            <span>{{ item.q }}</span>
            <span class="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-muted transition-transform duration-200"
              :class="{ 'rotate-180 text-primary': openIndex === idx }">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>

          <div
            v-if="openIndex === idx"
            class="px-5 pb-5 text-xs sm:text-sm text-text-muted leading-relaxed border-t border-border/50 pt-3 animate-fade-in"
          >
            {{ item.a }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
