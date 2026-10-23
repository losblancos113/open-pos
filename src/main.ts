import { createApp } from 'vue';
import App from './App.vue';
import { i18n, vuetifyLocale } from './i18n';
// Lớp style: preflight + utility do plugin UnoCSS sinh ra trước, rồi biến token của app.
import 'virtual:uno.css';
import './styles/tokens.css';

createApp(App).use(i18n).use(vuetifyLocale).mount('#app');
