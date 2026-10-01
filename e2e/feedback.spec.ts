import { expect, test, type Page, type Route } from '@playwright/test';

// J-A5 R-705: an online Send posts the C-16 payload and reads "Received" on a 2xx; offline or a
// failed post reads "Queued" and the outbox flushes on `online` and on app open. The feedback
// Worker route (/api/feedback) is stubbed with page.route; the service worker is blocked so
// every request reaches the route.
test.use({ serviceWorkers: 'block' });

const CTX = '/feedback?from=S05&pack=spa.MRK-1-1-13&unit=S02-U004';

type Posted = Record<string, unknown>;
async function stub(page: Page, status: () => number) {
  const posts: Posted[] = [];
  await page.route('**/api/feedback', async (route: Route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    posts.push(req.postDataJSON() as Posted);
    await route.fulfill({
      status: status(),
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  return posts;
}

async function send(page: Page, text: string) {
  await page.locator('#fia-feedback-text').fill(text);
  await page.locator('[data-role="primary"]').click();
}

test('online Send posts C-16 with context and reads Received', async ({ page }) => {
  const posts = await stub(page, () => 201);
  await page.goto(CTX);
  await expect(page.locator('[data-screen="S16"]')).toBeVisible();
  // context card: passage, unit, screen, content language
  const card = page.locator('.fia-feedback__context');
  await expect(card).toContainText('spa.MRK-1-1-13');
  await expect(card).toContainText('unit S02-U004');
  await expect(card).toContainText('S05');
  await expect(card).toContainText('Español (spa)');
  await send(page, 'Audio stopped in step 2.');
  await expect(page.getByText(/✓ Received/).first()).toBeVisible();
  await expect(page.getByText(/Queued/)).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    schemaVersion: 1,
    text: 'Audio stopped in step 2.',
    packId: 'spa.MRK-1-1-13',
    unitId: 'S02-U004',
    screen: 'S05',
    contentLanguage: 'spa',
    offline: false,
  });
});

test('a failed post reads Queued; reload (app open) flushes it to Received, one POST per id', async ({
  page,
}) => {
  let status = 503;
  const posts = await stub(page, () => status);
  await page.goto(CTX);
  await send(page, 'Queued then sent.');
  await expect(page.getByText('⊘ Queued — will send when online')).toBeVisible();
  await expect(page.getByText(/Waiting to send/)).toBeVisible();
  expect(posts).toHaveLength(1);
  status = 200;
  await page.reload();
  await expect(page.getByText(/· Received/)).toBeVisible();
  await expect(page.getByText(/Waiting to send/)).toHaveCount(0);
  const ids = posts.map((p) => p.id);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(1);
  // nothing waiting → app open sends nothing more
  await page.reload();
  await expect(page.getByText(/· Received/)).toBeVisible();
  expect(posts).toHaveLength(2);
});

test('offline Send reads Queued; the online event flushes it', async ({ page, context }) => {
  const posts = await stub(page, () => 201);
  await page.goto(CTX);
  await expect(page.locator('[data-screen="S16"]')).toBeVisible();
  await context.setOffline(true);
  await send(page, 'Sent while offline.');
  await expect(page.getByText('⊘ Queued — will send when online')).toBeVisible();
  await expect(page.getByText(/Waiting to send/)).toBeVisible();
  expect(posts).toHaveLength(0);
  await context.setOffline(false);
  await expect(page.getByText(/· Received/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ offline: true, text: 'Sent while offline.' });
});

test('a 400 refusal never reads Queued or Received; the draft stays', async ({ page }) => {
  const posts = await stub(page, () => 400);
  await page.goto(CTX);
  await send(page, 'Refused by the endpoint.');
  await expect(page.getByText('Could not send. Your text is still here.')).toBeVisible();
  await expect(page.locator('#fia-feedback-text')).toHaveValue('Refused by the endpoint.');
  await expect(page.getByText(/Not accepted/)).toBeVisible();
  await expect(page.getByText(/Queued|Received/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Not accepted/)).toBeVisible();
  expect(posts).toHaveLength(1);
});
