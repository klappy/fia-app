import {test, expect} from '@playwright/test';

const events = page => page.evaluate(() => window.__probe.events.map(e => e.type));
const ready = page => page.waitForFunction(() => window.__probe?.ready && window.__probe.events.some(e => e.type === 'loadedmetadata'));

test('manual play, pause and seek on the verified sample; nothing autoplays', async ({page}) => {
  await page.goto('/');
  await ready(page);
  expect(await page.evaluate(() => window.__probe.audio.paused)).toBe(true);
  await page.getByRole('button', {name: 'Play'}).click();
  await page.waitForFunction(() => window.__probe.audio.currentTime > 0.5);
  await page.getByRole('button', {name: 'Seek +5 s'}).click();
  await page.waitForFunction(() => window.__probe.events.some(e => e.type === 'seeked' && e.at >= 5));
  await page.getByRole('button', {name: 'Pause'}).click();
  await page.waitForFunction(() => window.__probe.audio.paused);
  const types = await events(page);
  for (const t of ['play', 'seeked', 'pause', 'save']) expect(types).toContain(t);
  expect(types).not.toContain('error');
});

test('reopen restores the saved position silently', async ({page}) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => { window.__probe.audio.currentTime = 7; });
  await page.waitForFunction(() => window.__probe.events.some(e => e.type === 'seeked'));
  await page.getByRole('button', {name: 'Save position'}).click();
  await page.reload();
  await ready(page);
  const s = await page.evaluate(() => ({status: window.__probe.events.find(e => e.type === 'storage').status, at: window.__probe.audio.currentTime, paused: window.__probe.audio.paused}));
  expect(s.status).toBe('restored');
  expect(s.at).toBeGreaterThan(6.5);
  expect(s.paused).toBe(true);
});

test('cleared and damaged storage recover to the start without errors', async ({page}) => {
  // Leaving the shell saves on pagehide, so damage is written from a same-origin
  // page that does not run the harness, then the shell is reopened.
  const reopenWith = async mutate => {
    await page.goto('/sample.json');
    await page.evaluate(mutate);
    await page.goto('/');
    await ready(page);
    return page.evaluate(() => ({status: window.__probe.events.find(e => e.type === 'storage').status, at: window.__probe.audio.currentTime}));
  };
  await page.goto('/');
  await ready(page);
  expect(await reopenWith(() => localStorage.setItem('fia-platform-probe:v1', '{"body":"{}","sum":"00000000"}'))).toEqual({status: 'recovered:checksum', at: 0});
  expect(await reopenWith(() => localStorage.clear())).toEqual({status: 'empty', at: 0});
});

test('backgrounding saves progress (emulated visibility change)', async ({page}) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const saves = await page.evaluate(() => window.__probe.events.filter(e => e.type === 'save').map(e => e.reason));
  expect(saves).toContain('hidden');
});

test('backgrounding before restore finishes never overwrites the saved position', async ({page}) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => { window.__probe.audio.currentTime = 9; });
  await page.waitForFunction(() => window.__probe.events.some(e => e.type === 'seeked'));
  await page.getByRole('button', {name: 'Save position'}).click();
  await page.goto('/sample.json');
  // Hold the audio response so the hide lands before loadedmetadata.
  let release;
  await page.route('**/sample.mp3', async route => { await new Promise(r => { release = r; }); await route.continue(); });
  await page.goto('/');
  await page.waitForFunction(() => window.__probe?.ready);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__probe.events.filter(e => e.type === 'save-skipped').map(e => e.reason))).toContain('hidden');
  expect(await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('fia-platform-probe:v1')).body).position)).toBeGreaterThan(8.5);
  release?.();
});
