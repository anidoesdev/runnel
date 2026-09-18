import '@n8n-clone/design-system/style.css';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import './styles/global.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { useTheme } from './composables/useTheme.js';

// Before mount, so the first paint is already in the right palette rather than flashing light.
useTheme().initTheme();

createApp(App).use(createPinia()).use(router).mount('#app');
