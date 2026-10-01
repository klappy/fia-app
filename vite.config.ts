/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { offlineShellManifest } from './src/offline/shell-manifest-plugin';

// vite-plugin-pwa gives the installable manifest and compiles the L2 offline service worker
// (src/offline/sw.ts, ported from the PoC, contract C-07) with `injectManifest`; registration is
// ours (src/offline/register.ts, production only). `offlineShellManifest` writes
// dist/offline-shell.json (shell files + sha256) that the worker precaches and verifies.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src/offline',
      filename: 'sw.ts',
      injectRegister: false,
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
      // No Workbox precache list: the worker reads dist/offline-shell.json (sha256 per file).
      injectManifest: { injectionPoint: undefined },
    }),
    offlineShellManifest(),
  ],
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
