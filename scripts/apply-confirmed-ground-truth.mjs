import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const filePath = path.join(root, 'tests/fixtures/google-drive-test-manifest.json');
const manifest = JSON.parse(await readFile(filePath, 'utf8'));
const confirmed = new Map(Object.entries({
  'IMG_1703.HEIC': ['刈穂', '秋田清酒', 'sake'],
  'IMG_1704.HEIC': ['久保田', '朝日酒造', 'sake'],
  'IMG_2050.HEIC': ['宮城峡', 'ニッカウヰスキー', 'whisky'],
  'IMG_2051.HEIC': ['響', 'サントリー', 'whisky'],
  'IMG_2269.HEIC': ['ニッカ カフェモルト', 'ニッカウヰスキー', 'whisky'],
  'IMG_2271.HEIC': ['ニッカ カフェモルト', 'ニッカウヰスキー', 'whisky'],
  'IMG_2272.HEIC': ['ニッカ カフェモルト', 'ニッカウヰスキー', 'whisky'],
  'IMG_2291.HEIC': ['鍋島', '富久千代酒造', 'sake'],
  'IMG_2292.HEIC': ['鍋島', '富久千代酒造', 'sake'],
  'IMG_2296.HEIC': ['知多', 'サントリー', 'whisky'],
  'IMG_2297.HEIC': ['知多', 'サントリー', 'whisky'],
  'IMG_2325.HEIC': ['余市', 'ニッカウヰスキー', 'whisky'],
  '1ADFD1E9-B715-4B5E-AEED-348CECA61B64.JPG': ['響', 'サントリー', 'whisky'],
  '3780045A-CF34-4840-A568-B8E57175AA1D.JPG': ['W', '渡辺酒造店', 'sake']
}));

for (const item of manifest) {
  const truth = confirmed.get(item.fileName);
  if (!truth) continue;
  item.groundTruthStatus = 'confirmed';
  item.expectedProductName = truth[0];
  item.expectedMakerName = truth[1];
  item.expectedAlcoholType = truth[2];
  item.groundTruthSource = 'manual visual review of temporary contact sheet, 2026-07-15';
}

await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ confirmed: confirmed.size, total: manifest.length }, null, 2));
