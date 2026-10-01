/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { offlineShellManifest } from './src/offline/shell-manifest-plugin';

// Build stamp: emit dist/version.json so a deployed env can prove which commit it serves
// (post-deploy gate, RELEASING.md). Workers Builds injects WORKERS_CI_COMMIT_SHA and
// WORKERS_CI_BRANCH (developers.cloudflare.com/workers/ci-cd/builds/configuration/);
// GitHub Actions sets GITHUB_SHA / GITHUB_REF_NAME; local builds fall back to git.
function git(args: string): string | undefined {
  try {
    return (
      execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function versionStamp(): Plugin {
  return {
    name: 'fia-version-stamp',
    apply: 'build',
    generateBundle() {
      const env = process.env;
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
      const stamp = {
        version: pkg.version as string,
        commit: env.WORKERS_CI_COMMIT_SHA || env.GITHUB_SHA || git('rev-parse HEAD') || 'unknown',
        branch:
          env.WORKERS_CI_BRANCH ||
          env.GITHUB_REF_NAME ||
          git('rev-parse --abbrev-ref HEAD') ||
          'unknown',
        builtAt: new Date().toISOString(),
      };
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(stamp, null, 2)}\n`,
      });
    },
  };
}

// vite-plugin-pwa gives the installable manifest and compiles the L2 offline service worker
// (src/offline/sw.ts, ported from the PoC, contract C-07) with `injectManifest`; registration is
// ours (src/offline/register.ts, production only). `offlineShellManifest` writes
// dist/offline-shell.json (shell files + sha256) that the worker precaches and verifies.
export default defineConfig({
  plugins: [
    react(),
    versionStamp(),
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
