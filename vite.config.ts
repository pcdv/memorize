/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Must match the GitHub repository name: GH Pages serves the app under /<repo>/.
const base = '/memorize/'

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Our own worker (src/sw.ts) adds the daily reminder to the offline cache.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png', 'samples/*.txt'],
      manifest: {
        name: 'Memorize',
        short_name: 'Memorize',
        description: 'Spaced-repetition flashcards from simple "question : answer" files',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f5fb',
        theme_color: '#5b4bdb',
        // Lets Android's share sheet send text to the installed app (Chromium browsers only).
        share_target: {
          action: base,
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,txt,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
