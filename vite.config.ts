/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// vite-plugin-pwa gives the scaffold an installable manifest and a generated precache SW.
// L2 owns the real offline service worker (ported from the PoC, contract C-07); it will
// replace `generateSW` with `injectManifest` when it lands.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'FIA — Familiarization · Internalization · Articulation',
        short_name: 'FIA',
        description: 'Guided oral Bible engagement, offline-first.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EEF0F5',
        theme_color: '#EEF0F5',
        lang: 'en',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'], navigateFallback: '/index.html' },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
