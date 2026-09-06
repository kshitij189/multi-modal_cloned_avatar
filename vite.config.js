import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    // Inline nothing as base64 — the payload budget in PRD §11.2 counts every byte,
    // and a silently inlined asset is a budget breach you cannot see in the build output.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    port: 5173,
    // In dev the Worker runs separately on :8787 (npm run dev:all).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
