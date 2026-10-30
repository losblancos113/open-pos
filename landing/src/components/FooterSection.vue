<script setup lang="ts">
import { useI18n } from '../i18n';
import { REPOSITORY_URL } from '../composables/useLatestRelease';

const { t, locale, setLocale } = useI18n();
const issuesUrl = `${REPOSITORY_URL}/issues`;

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>

<template>
  <footer class="border-t border-border bg-surface py-12 text-xs text-text-muted">
    <div class="section-container">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-border">
        <!-- Col 1: Brand Info -->
        <div class="md:col-span-2 space-y-3">
          <div class="flex items-center gap-2.5">
            <img src="/logo-mark.svg" alt="Open POS Logo" class="h-8 w-8 rounded-lg shadow-soft" />
            <span class="font-bold text-base text-text">{{ t.footer.brand }}</span>
          </div>
          <p class="text-xs text-text-muted max-w-sm leading-relaxed">
            {{ t.footer.desc }}
          </p>
          <p class="text-[11px] text-text-subtle">
            {{ t.footer.license }}
          </p>
        </div>

        <!-- Col 2: Navigation Links -->
        <div>
          <h4 class="font-bold text-text uppercase tracking-wider text-[11px] mb-3">{{ t.footer.navigation }}</h4>
          <ul class="space-y-2">
            <li><a href="#demo" class="hover:text-primary transition-colors">{{ t.nav.demo }}</a></li>
            <li><a href="#features" class="hover:text-primary transition-colors">{{ t.nav.features }}</a></li>
            <li><a href="#architecture" class="hover:text-primary transition-colors">{{ t.nav.architecture }}</a></li>
            <li><a href="#comparison" class="hover:text-primary transition-colors">{{ t.nav.comparison }}</a></li>
            <li><a href="#freedom" class="hover:text-primary transition-colors">{{ t.nav.freedom }}</a></li>
            <li><a href="#faq" class="hover:text-primary transition-colors">{{ t.nav.faq }}</a></li>
          </ul>
        </div>

        <!-- Col 3: Language & Community -->
        <div>
          <h4 class="font-bold text-text uppercase tracking-wider text-[11px] mb-3">{{ t.footer.community }}</h4>
          <ul class="space-y-2 mb-4">
            <li>
              <a :href="REPOSITORY_URL" target="_blank" rel="noopener noreferrer" class="hover:text-primary transition-colors flex items-center gap-1.5">
                <span>GitHub Repository</span>
                <span class="text-[10px] text-text-subtle">↗</span>
              </a>
            </li>
            <li>
              <a :href="issuesUrl" target="_blank" rel="noopener noreferrer" class="hover:text-primary transition-colors flex items-center gap-1.5">
                <span>Báo lỗi / Issues</span>
                <span class="text-[10px] text-text-subtle">↗</span>
              </a>
            </li>
          </ul>

          <!-- Quick Locale Switch -->
          <div class="pt-2">
            <div class="inline-flex rounded-lg border border-border bg-bg-subtle p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                class="px-2 py-0.5 rounded"
                :class="locale === 'vi' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'"
                @click="setLocale('vi')"
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                class="px-2 py-0.5 rounded"
                :class="locale === 'en' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'"
                @click="setLocale('en')"
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-text-subtle">
        <div>{{ t.footer.rights }}</div>
        <button
          type="button"
          class="hover:text-text font-medium flex items-center gap-1"
          @click="scrollToTop"
        >
          <span>Về đầu trang / Back to top</span>
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>
  </footer>
</template>
