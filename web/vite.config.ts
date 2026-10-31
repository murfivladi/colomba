import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const API = process.env.COLOMBA_API ?? 'http://localhost:8080';

// Приложение живёт по адресу vladinc.ru/colomba: статика на shared-хостинге,
// /colomba/api проксируется на VPS (.htaccess), в разработке — прокси Vite.
export default defineConfig({
  base: '/colomba/',
  resolve: {
    alias: { '@colomba/shared': path.resolve(__dirname, '../shared/src/index.ts') },
  },
  server: {
    port: 5173,
    proxy: {
      '/colomba/api': { target: API, changeOrigin: true, rewrite: (p) => p.replace(/^\/colomba/, '') },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Colomba',
        short_name: 'Colomba',
        description: 'Медленные письма с курьерами · Lettere lente con i corrieri',
        lang: 'ru',
        start_url: '/colomba/',
        scope: '/colomba/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3e7cf',
        theme_color: '#7a2a1d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
