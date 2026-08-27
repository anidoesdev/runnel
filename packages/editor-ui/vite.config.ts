import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// The editor is a static SPA; in dev it needs the real cli server (packages/cli, `pnpm dev`
// or `n8n-clone start`) running separately — this proxy makes `/rest` and `/webhook` same-origin
// so the browser sends the session cookie without any CORS configuration on the backend.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5679';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      '/rest': { target: apiTarget, changeOrigin: true },
      '/webhook': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
