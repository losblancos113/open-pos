<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();
</script>

<template>
  <section id="download" class="py-20 md:py-28 bg-bg-subtle border-t border-border">
    <div class="section-container">
      <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-text to-slate-900 px-6 py-16 text-center text-white shadow-elevated sm:px-12 md:py-20">
        <!-- Subtle pattern overlay -->
        <div class="pointer-events-none absolute inset-0 opacity-10 grid-pattern"></div>
        <div class="pointer-events-none absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-primary/30 blur-[100px]"></div>

        <div class="relative mx-auto max-w-3xl">
          <div class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-primary-subtle backdrop-blur-md mb-6">
            {{ t.cta.badge }}
          </div>

          <h2 class="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            {{ t.cta.title }}
          </h2>

          <p class="mt-5 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
            {{ t.cta.subtitle }}
          </p>

          <div class="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              class="btn bg-primary text-white hover:bg-primary-hover px-7 py-3.5 text-sm font-bold shadow-lg"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {{ t.cta.btnDownload }}
            </a>

            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              class="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-3.5 text-sm font-semibold backdrop-blur-md"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              {{ t.cta.btnGithub }}
            </a>
          </div>

          <div class="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 font-mono">
            <span>● Windows 10/11 (MSI / EXE)</span>
            <span>● macOS Apple Silicon / Intel</span>
            <span>● Linux (AppImage)</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
