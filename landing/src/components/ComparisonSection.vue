<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();
</script>

<template>
  <section id="comparison" class="py-20 md:py-28 bg-surface">
    <div class="section-container">
      <div class="mx-auto max-w-3xl text-center mb-16">
        <div class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary mb-3">
          {{ t.comparison.badge }}
        </div>
        <h2 class="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
          {{ t.comparison.title }}
        </h2>
        <p class="mt-4 text-base text-text-muted leading-relaxed">
          {{ t.comparison.subtitle }}
        </p>
      </div>

      <!-- Comparison Table Card -->
      <div class="mx-auto max-w-5xl rounded-2xl border border-border bg-surface shadow-card overflow-x-auto">
        <table class="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr class="border-b border-border bg-bg-subtle text-xs font-bold uppercase tracking-wider text-text">
              <th class="py-4 px-6 w-1/4">{{ t.comparison.colCriterion }}</th>
              <th class="py-4 px-6 w-1/4 bg-primary-subtle/50 text-primary border-x border-primary/20">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-primary"></span>
                  {{ t.comparison.colOpenPos }}
                </div>
              </th>
              <th class="py-4 px-6 w-1/4 text-text-muted">{{ t.comparison.colCloud }}</th>
              <th class="py-4 px-6 w-1/4 text-text-muted">{{ t.comparison.colLegacy }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border text-xs sm:text-sm">
            <tr v-for="(row, idx) in t.comparison.rows" :key="idx" class="hover:bg-bg-subtle/50 transition-colors">
              <td class="py-4 px-6 font-semibold text-text">
                {{ row.criterion }}
              </td>

              <!-- Open POS Col (Highlighted) -->
              <td class="py-4 px-6 font-bold text-primary bg-primary-subtle/30 border-x border-primary/20">
                <div class="flex items-center gap-2">
                  <svg class="h-4 w-4 shrink-0 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{{ row.openPos }}</span>
                </div>
              </td>

              <!-- Cloud POS Col -->
              <td class="py-4 px-6 text-text-muted">
                {{ row.cloud }}
              </td>

              <!-- Legacy POS Col -->
              <td class="py-4 px-6 text-text-muted">
                {{ row.legacy }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
