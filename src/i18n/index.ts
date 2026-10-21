import { createI18n } from 'vue-i18n';

export const i18n = createI18n({
  legacy: false,
  locale: 'vi',
  messages: {
    vi: {
      app: {
        title: 'Open POS',
        tagline: 'Phần mềm quản lý bán hàng',
      },
    },
  },
});
