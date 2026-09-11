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
        // The portfolio embeds this by URL, so it must keep a stable, unhashed filename:
        // the script tag on the portfolio cannot be updated on every agent deploy without
        // breaking the two-repo independence rule.
        embed: 'src/embed.js',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js'),
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
