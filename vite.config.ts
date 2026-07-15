import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/sake-log/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/tesseract.js') || id.includes('node_modules/tesseract.js-core')) return 'tesseract';
          return undefined;
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SAKEログ',
        short_name: 'SAKEログ',
        description: '飲んだお酒を写真付きで記録し、評価と味覚傾向を端末内で管理する無料PWA。',
        theme_color: '#07100d',
        background_color: '#07100d',
        display: 'standalone',
        start_url: '/sake-log/',
        scope: '/sake-log/',
        lang: 'ja',
        icons: [{ src: 'favicon.svg', sizes: '64x64', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/heic2any-*.js', '**/tesseract-*.js'],
        runtimeCaching: [{
          urlPattern: /\/assets\/(?:heic2any|tesseract)-[^/]+\.js$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'sake-log-image-processing-v1',
            expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 }
          }
        }]
      }
    })
  ]
});
