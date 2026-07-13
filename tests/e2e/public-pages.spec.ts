import { expect, test } from '@playwright/test';
import path from 'node:path';

async function enterApp(page: import('@playwright/test').Page) {
  await page.goto('./', { waitUntil: 'networkidle' });
  const ageButton = page.getByRole('button', { name: '20歳以上です' });
  if (await ageButton.isVisible().catch(() => false)) await ageButton.click();
  await expect(page.getByRole('button', { name: 'ホーム' })).toBeVisible();
}

test('mobile navigation survives 100 transitions and diagnostics is safe', async ({ page }) => {
  await enterApp(page);
  const tabs = ['記録', 'ログ', '分析', '設定', 'ホーム'];
  for (let cycle = 0; cycle < 20; cycle += 1) {
    for (const tab of tabs) await page.getByRole('button', { name: tab, exact: true }).click();
  }
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByRole('button', { name: '診断情報を更新' }).click();
  const diagnostics = page.locator('pre');
  await expect(diagnostics).toContainText('indexedDb');
  await expect(diagnostics).not.toContainText('rakutenApplicationId');
  await expect(page.getByText(/Build [a-f0-9]{7,}/)).toBeVisible();
});

test('photo import runs OCR and shows confidence without auto confirmation', async ({ page }) => {
  await enterApp(page);
  const fixture = path.resolve('tests/fixtures/front-sake.png');
  await page.getByText('写真から記録する').locator('..').locator('input[type=file]').setInputFiles(fixture);
  await expect(page.getByText(/OCR信頼度 \d+%/)).toBeVisible({ timeout: 140_000 });
  await expect(page.getByText('候補は自動確定されません。内容を確認してください。').first()).toBeVisible();
});

test('installed PWA shell is prepared for offline use', async ({ page, context, browserName }) => {
  await enterApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  });
  if (browserName === 'webkit') {
    const cachedUrls = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const requests = await Promise.all(
        cacheNames.map(async (cacheName) => (await caches.open(cacheName)).keys())
      );
      return requests.flat().map((request) => request.url);
    });
    expect(cachedUrls.some((url) => url.endsWith('/sake-log/index.html'))).toBe(true);
    expect(cachedUrls.some((url) => /\/sake-log\/assets\/.+\.js$/.test(url))).toBe(true);
    return;
  }
  const appUrl = page.url();
  await page.goto('about:blank');
  await context.setOffline(true);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('SAKEログ').first()).toBeVisible();
  await context.setOffline(false);
});
