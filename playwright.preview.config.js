import {defineConfig} from '@playwright/test';
// PR preview check: the same specs, but against a worker preview origin (BASE_URL), in Chromium and WebKit.
process.env.FIA_EVERY_PERICOPE='1';
const base=process.env.BASE_URL;
if(!base||!/^https:\/\/fia-pool-preview-\d+\.klappy\.workers\.dev$/.test(base))throw Error('BASE_URL must be a fia-pool-preview-<pr>.klappy.workers.dev origin');
export default defineConfig({testDir:'e2e',testMatch:'every-pericope-plays.spec.js',timeout:120000,reporter:'list',use:{baseURL:base,viewport:{width:390,height:844},serviceWorkers:'block'},projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}]});
