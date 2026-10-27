<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../i18n';

const { locale, t, setLocale } = useI18n();
const isMobileMenuOpen = ref(false);

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-md transition-all">
    <div class="section-container flex h-16 items-center justify-between">
      <!-- Logo & Brand -->
      <a href="#" class="flex items-center gap-3 group">
        <div class="relative flex h-10 w-10 items-center justify-center transition-transform duration-200 group-hover:scale-105">
          <img src="/logo-mark.svg" alt="Open POS Logo" class="h-10 w-10 rounded-xl shadow-soft" />
          <span class="absolute -top-1 -right-1 flex h-3 w-3">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
            <span class="relative inline-flex h-3 w-3 rounded-full bg-success"></span>
          </span>
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-lg tracking-tight text-text">{{ t.nav.brand }}</span>
            <span class="rounded bg-primary-subtle px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">v0.1.0</span>
          </div>
          <span class="text-xs text-text-muted hidden sm:inline">{{ t.nav.tagline }}</span>
        </div>
      </a>

      <!-- Desktop Nav -->
      <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-text-muted">
        <a href="#demo" class="transition-colors hover:text-text">{{ t.nav.demo }}</a>
        <a href="#features" class="transition-colors hover:text-text">{{ t.nav.features }}</a>
        <a href="#architecture" class="transition-colors hover:text-text">{{ t.nav.architecture }}</a>
        <a href="#comparison" class="transition-colors hover:text-text">{{ t.nav.comparison }}</a>
        <a href="#freedom" class="transition-colors hover:text-text">{{ t.nav.freedom }}</a>
        <a href="#faq" class="transition-colors hover:text-text">{{ t.nav.faq }}</a>
      </nav>

      <!-- Right Actions: Language Switcher & CTA -->
      <div class="hidden sm:flex items-center gap-3">
        <!-- Language Switcher Pill -->
        <div class="flex items-center rounded-lg border border-border bg-bg-subtle p-0.5 text-xs font-semibold">
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-all"
            :class="locale === 'vi' ? 'bg-surface text-primary shadow-soft font-bold' : 'text-text-muted hover:text-text'"
            @click="setLocale('vi')"
          >
            🇻🇳 Tiếng Việt
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 transition-all"
            :class="locale === 'en' ? 'bg-surface text-primary shadow-soft font-bold' : 'text-text-muted hover:text-text'"
            @click="setLocale('en')"
          >
            🇬🇧 English
          </button>
        </div>

        <!-- GitHub Link -->
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-secondary px-3 py-1.5 text-xs"
          title="GitHub Repository"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          <span class="hidden lg:inline">GitHub</span>
        </a>

        <!-- Download CTA -->
        <a href="#download" class="btn btn-primary px-3.5 py-1.5 text-xs font-bold">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {{ t.nav.download }}
        </a>
      </div>

      <!-- Mobile Hamburger Button -->
      <button
        type="button"
        class="flex sm:hidden p-2 text-text-muted hover:text-text rounded-lg hover:bg-bg-subtle"
        @click="toggleMobileMenu"
        aria-label="Toggle Navigation"
      >
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Mobile Drawer -->
    <div v-if="isMobileMenuOpen" class="sm:hidden border-t border-border bg-surface px-4 py-4 space-y-3">
      <div class="flex items-center justify-between pb-3 border-b border-border">
        <span class="text-xs font-medium text-text-muted">Ngôn ngữ / Language:</span>
        <div class="flex items-center rounded-lg border border-border bg-bg-subtle p-0.5 text-xs font-semibold">
          <button
            type="button"
            class="rounded-md px-2 py-1"
            :class="locale === 'vi' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'"
            @click="setLocale('vi')"
          >
            🇻🇳 VN
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1"
            :class="locale === 'en' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'"
            @click="setLocale('en')"
          >
            🇬🇧 EN
          </button>
        </div>
      </div>
      <nav class="flex flex-col gap-2 text-sm font-medium text-text-muted">
        <a href="#demo" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.demo }}</a>
        <a href="#features" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.features }}</a>
        <a href="#architecture" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.architecture }}</a>
        <a href="#comparison" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.comparison }}</a>
        <a href="#freedom" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.freedom }}</a>
        <a href="#faq" @click="isMobileMenuOpen = false" class="py-2 hover:text-primary">{{ t.nav.faq }}</a>
      </nav>
      <div class="pt-2">
        <a href="#download" @click="isMobileMenuOpen = false" class="btn btn-primary w-full text-center">
          {{ t.nav.download }}
        </a>
      </div>
    </div>
  </header>
</template>
