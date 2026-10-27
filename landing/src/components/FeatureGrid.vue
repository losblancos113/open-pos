<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();

const featureIcons = [
  // 1: Math / Accounting
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  // 2: Type Registry / Schema
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  // 3: Tauri 2 Performance
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  // 4: VietQR
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  // 5: Thermal Printing
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  // 6: Ergonomic UI
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>`,
];
</script>

<template>
  <section id="features" class="py-20 md:py-28 bg-bg-subtle border-t border-border">
    <div class="section-container">
      <div class="mx-auto max-w-3xl text-center mb-16">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary mb-3">
          {{ t.featuresGrid.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.featuresGrid.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted leading-relaxed">
          {{ t.featuresGrid.subtitle }}
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="(item, index) in t.featuresGrid.items"
          :key="index"
          class="card-base p-6 flex flex-col justify-between card-hover group"
        >
          <div>
            <div class="flex items-center justify-between mb-4">
              <div
                class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary transition-transform duration-200 group-hover:scale-110"
                v-html="featureIcons[index]"
              ></div>
              <span class="rounded bg-bg-subtle px-2 py-0.5 font-mono text-[11px] font-bold text-text-muted border border-border">
                {{ item.tag }}
              </span>
            </div>

            <h3 class="text-lg font-bold text-text group-hover:text-primary transition-colors">
              {{ item.title }}
            </h3>

            <p class="mt-2.5 text-xs sm:text-sm text-text-muted leading-relaxed">
              {{ item.desc }}
            </p>
          </div>

          <div class="mt-6 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-mono text-text-muted">
            <span>Module #0{{ index + 1 }}</span>
            <span class="text-success font-medium">Ready in Core</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
