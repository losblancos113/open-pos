import { createApp } from 'vue';
import App from './App.vue';
import { i18n, vuetifyLocale } from './i18n';
import './styles/tokens.css';

createApp(App).use(i18n).use(vuetifyLocale).mount('#app');
