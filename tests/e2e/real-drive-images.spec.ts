import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const imageDir = process.env.DRIVE_IMAGE_DIR;
const allImages = imageDir
  ? readdirSync(imageDir)
      .filter((name) => /\.(?:heic|heif|jpe?g|png|webp)$/i.test(name))
      .sort()
  : [];

function representativeBatch(offset: number) {
  const heic = allImages.filter((name) => /\.(?:heic|heif)$/i.test(name));
  const raster = allImages.filter((name) => /\.(?:jpe?g|png|webp)$/i.test(name));
  return [...heic.slice(offset * 8, offset * 8 + 8), ...raster.slice(offset * 2, offset * 2 + 2)]
    .map((name) => path.join(imageDir!, name));
}

async function enterApp(page: import('@playwright/test').Page) {
  await page.goto('./', { waitUntil: 'networkidle' });
  const ageButton = page.getByRole('button', { name: '20歳以上です' });
  if (await ageButton.isVisible().catch(() => false)) await ageButton.click();
}

for (const batchIndex of [0, 1]) {
  test(`production browser path imports real Drive images batch ${batchIndex + 1}`, async ({ page }, testInfo) => {
    test.skip(!imageDir || allImages.length < 20, 'DRIVE_IMAGE_DIR with 20 real images is required');
    test.skip(testInfo.project.name !== (batchIndex === 0 ? 'iPhone' : 'Android'), 'Each batch runs once on its target browser');
    test.setTimeout(600_000);
    await enterApp(page);
    const files = representativeBatch(batchIndex);
    expect(files).toHaveLength(10);
    await page.locator('input[type=file][multiple]').first().setInputFiles(files);
    await page.getByRole('button', { name: '1つのお酒に複数写真を追加する' }).click();

    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('img[src^="blob:"]')).toHaveCount(10, { timeout: 540_000 });
    await expect(page.getByText(/OCR信頼度 \d+%/).first()).toBeVisible();
    await expect(page.getByText('候補は自動確定されません。内容を確認してください。').first()).toBeVisible();
  });
}
