import { ref, computed } from 'vue';
import { vi } from './vi';
import { en } from './en';

export type Locale = 'vi' | 'en';

const STORAGE_KEY = 'open_pos_landing_locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'vi';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'vi' || saved === 'en') return saved;
  return 'vi';
}

const currentLocale = ref<Locale>(getInitialLocale());

if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLocale.value;
}

export function useI18n() {
  const locale = currentLocale;

  const t = computed(() => {
    return currentLocale.value === 'vi' ? vi : en;
  });

  function setLocale(newLocale: Locale) {
    currentLocale.value = newLocale;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    }
  }

  function toggleLocale() {
    setLocale(currentLocale.value === 'vi' ? 'en' : 'vi');
  }

  return {
    locale,
    t,
    setLocale,
    toggleLocale,
  };
}
