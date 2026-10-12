import {defineConfig} from '@playwright/test';
const deployed=process.env.BASE_URL;
if(deployed&&process.env.FIA_WORKER_PREVIEW==='1')throw Error('Worker preview is local only; do not combine it with BASE_URL');
if(deployed && !['https://dev.fiaguide.app','https://staging.fiaguide.app','https://fiaguide.app'].includes(deployed))throw Error('Deployed checks are restricted to approved public environments');
export default defineConfig({testDir:'e2e',timeout:60000,retries:process.env.CI?1:0,reporter:process.env.CI?'github':'list',use:{baseURL:deployed || 'http://127.0.0.1:4173',viewport:{width:390,height:844},trace:'retain-on-failure'},projects:[{name:'chromium',use:{browserName:'chromium'}}],webServer:deployed?undefined:{command:process.env.FIA_WORKER_PREVIEW==='1'?'node scripts/worker-preview.mjs':'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}});
