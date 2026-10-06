import {defineConfig} from '@playwright/test';
const origins={dev:'https://dev.fiaguide.app',staging:'https://staging.fiaguide.app',production:'https://fiaguide.app'};
if(!/^[a-f0-9]{40}$/.test(process.env.EXPECT_COMMIT||''))throw Error('EXPECT_COMMIT must be the full candidate commit');
if(origins[process.env.FIA_ENVIRONMENT]!==process.env.BASE_URL)throw Error('Explicit matching FIA_ENVIRONMENT and BASE_URL required');
export default defineConfig({testDir:'e2e/live-listening',timeout:120000,retries:0,workers:1,reporter:[['list'],['json',{outputFile:'test-results/live-listening.json'}]],use:{baseURL:process.env.BASE_URL,viewport:{width:390,height:844},trace:'on',video:'on',screenshot:'on',serviceWorkers:'allow'},projects:[{name:'live-chromium',use:{browserName:'chromium'}}]});
