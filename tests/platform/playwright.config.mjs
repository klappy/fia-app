// Harness self-test only: desktop Chromium at a phone viewport. This is not
// Android or iPhone evidence; device rows stay open in the experiment README.
import {defineConfig} from '@playwright/test';
const port = Number(process.env.PLATFORM_PORT || 4180);
export default defineConfig({
  testDir: '.', testMatch: /shell\.spec\.mjs$/, timeout: 60000, reporter: 'list',
  use: {baseURL: `http://127.0.0.1:${port}`, viewport: {width: 390, height: 844}, trace: 'retain-on-failure'},
  projects: [{name: 'chromium-phone-viewport', use: {browserName: 'chromium'}}],
  webServer: {command: `node experiments/platform/serve.mjs`, cwd: '../..', env: {PORT: String(port)}, url: `http://127.0.0.1:${port}/sample.json`, reuseExistingServer: false},
});
