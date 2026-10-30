<script setup lang="ts">
import { useI18n } from '../i18n';
import { REPOSITORY_URL } from '../composables/useLatestRelease';

const { t } = useI18n();
</script>

<template>
  <section class="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
    <!-- Subtle architectural grid texture, avoiding generic AI neon blobs -->
    <div class="pointer-events-none absolute inset-0 grid-pattern opacity-60"></div>
    <div class="pointer-events-none absolute -top-40 right-1/2 translate-x-1/2 w-[800px] h-[350px] bg-primary/5 blur-[120px] rounded-full"></div>

    <div class="section-container relative">
      <div class="mx-auto max-w-4xl text-center">
        <!-- Top Pill Badge -->
        <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-subtle px-3.5 py-1.5 text-xs font-semibold text-primary shadow-soft mb-8 animate-fade-in">
          <span class="flex h-2 w-2 rounded-full bg-success"></span>
          <span>{{ t.hero.badge }}</span>
        </div>

        <!-- Main Headline -->
        <h1 class="text-4xl font-extrabold tracking-tight text-text sm:text-5xl md:text-6xl lg:text-[64px] lg:leading-[1.12]">
          {{ t.hero.titleLine1 }}
          <span class="block text-primary underline decoration-primary/30 decoration-wavy underline-offset-8">
            {{ t.hero.titleHighlight }}
          </span>
        </h1>

        <!-- Subtitle / Value Prop -->
        <p class="mt-6 text-lg leading-relaxed text-text-muted sm:text-xl max-w-3xl mx-auto font-normal">
          {{ t.hero.description }}
        </p>

        <!-- CTA Buttons -->
        <div class="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="#download" class="btn btn-primary px-7 py-3.5 text-base font-bold shadow-md hover:shadow-lg">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {{ t.hero.ctaDownload }}
          </a>

          <a :href="REPOSITORY_URL" target="_blank" rel="noopener noreferrer" class="btn btn-secondary px-6 py-3.5 text-base font-semibold">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            {{ t.hero.ctaGithub }}
          </a>

          <a href="#demo" class="btn btn-ghost px-5 py-3.5 text-sm font-semibold text-text-muted hover:text-text">
            {{ t.hero.ctaDemo }}
          </a>
        </div>

        <!-- 4 Credibility Pills -->
        <div class="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs sm:text-sm font-medium text-text-muted">
          <div class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-soft">
            <svg class="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{{ t.hero.pills[0]?.text }}</span>
          </div>

          <div class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-soft">
            <svg class="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>{{ t.hero.pills[1]?.text }}</span>
          </div>

          <div class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-soft">
            <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{{ t.hero.pills[2]?.text }}</span>
          </div>

          <div class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 shadow-soft">
            <svg class="h-4 w-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{{ t.hero.pills[3]?.text }}</span>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6 border-t border-border pt-10 text-left">
          <div class="card-base p-4">
            <div class="font-mono text-2xl font-bold tracking-tight text-primary">{{ t.stats.stat1Value }}</div>
            <div class="mt-1 text-xs text-text-muted font-medium">{{ t.stats.stat1Label }}</div>
          </div>
          <div class="card-base p-4">
            <div class="font-mono text-2xl font-bold tracking-tight text-success">{{ t.stats.stat2Value }}</div>
            <div class="mt-1 text-xs text-text-muted font-medium">{{ t.stats.stat2Label }}</div>
          </div>
          <div class="card-base p-4">
            <div class="font-mono text-2xl font-bold tracking-tight text-accent">{{ t.stats.stat3Value }}</div>
            <div class="mt-1 text-xs text-text-muted font-medium">{{ t.stats.stat3Label }}</div>
          </div>
          <div class="card-base p-4">
            <div class="font-mono text-2xl font-bold tracking-tight text-text">{{ t.stats.stat4Value }}</div>
            <div class="mt-1 text-xs text-text-muted font-medium">{{ t.stats.stat4Label }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
