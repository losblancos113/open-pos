import { createI18n } from 'vue-i18n';
import vi from './vi.json';
import en from './en.json';

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const i18n = createI18n({
  legacy: false,
  locale: 'vi' satisfies SupportedLocale,
  fallbackLocale: 'vi',
  messages: { vi, en },
});
