import { createI18n } from 'vue-i18n';
import type { Composer } from 'vue-i18n';
import { createLocalePlugin } from '@vuetify/v0/locale';
import { VueI18nLocaleAdapter } from '@vuetify/v0/locale/adapters/vue-i18n';
import vuetifyEn from '@vuetify/v0/locale/messages/en';
import vi from './vi.json';
import en from './en.json';

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const i18n = createI18n({
  legacy: false,
  locale: 'vi' satisfies SupportedLocale,
  fallbackLocale: 'vi',
  messages: {
    // Vuetify0 chỉ ship chuỗi tiếng Anh cho component của nó (nhãn aria, trạng thái
    // rỗng…). Ghép gói đó vào **cả hai** locale làm lớp nền: nếu không, các key như
    // `Input.required` sẽ tra vào vi.json, không thấy, rồi hiện nguyên tên key ra UI.
    // Key của app nằm dưới nên vẫn ghi đè lớp nền khi trùng.
    vi: { ...vuetifyEn, ...vi },
    en: { ...vuetifyEn, ...en },
  },
});

/**
 * Vuetify0 đọc chuỗi của nó qua một locale adapter. Giao lại cho vue-i18n để chỉ có
 * một nguồn sự thật: đổi `i18n.locale` là đổi luôn chuỗi và định dạng số của Vuetify0.
 *
 * Adapter chỉ uỷ nhiệm `t`/`ti`/`n` sang `i18n.global`, nên không cần đồng bộ locale
 * giữa hai bên.
 *
 * `VueI18nLocaleAdapter` khai báo tham số là `Composer` với generic mặc định
 * (`locale: string`), còn `i18n.global` của app gắn với schema message cụ thể và
 * union `'vi' | 'en'` — hai kiểu không gán được cho nhau dù chạy đúng. Đây là giới hạn
 * khai báo của thư viện; ép kiểu khu trú ở đúng chỗ này, không nới lỏng chỗ khác.
 */
export const vuetifyAdapter = new VueI18nLocaleAdapter(i18n as unknown as { global: Composer });

export const vuetifyLocale = createLocalePlugin({ adapter: vuetifyAdapter });
