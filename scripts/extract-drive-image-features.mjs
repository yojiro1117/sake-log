import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import convert from 'heic-convert';
import { Jimp } from 'jimp';

const root = process.cwd();
const imageDir = path.resolve(root, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp');
const files = JSON.parse(await readFile(path.join(root, 'tests/fixtures/google-drive-files.json'), 'utf8'));
const downloadResults = JSON.parse(await readFile(path.join(imageDir, 'download-results.json'), 'utf8').catch(() => '[]'));
const localNameById = new Map(downloadResults.map((item) => [item.driveFileId, item.localFileName]));
const results = [];

for (const file of files) {
  const raw = await readFile(path.join(imageDir, localNameById.get(file.driveFileId) ?? file.fileName));
  const bytes = /\.hei[cf]$/i.test(file.fileName) ? await convert({ buffer: raw, format: 'JPEG', quality: 0.65 }) : raw;
  const image = await Jimp.read(bytes);
  image.resize({ w: 64, h: 64 });
  const center = [];
  const outer = [];
  const gray = (x, y) => {
    const color = image.getPixelColor(x, y);
    const r = color >>> 24;
    const g = color >>> 16 & 255;
    const b = color >>> 8 & 255;
    return r * 0.299 + g * 0.587 + b * 0.114;
  };
  for (let y = 1; y < 63; y += 1) {
    for (let x = 1; x < 63; x += 1) {
      const gradient = (Math.abs(gray(x, y) - gray(x - 1, y)) + Math.abs(gray(x, y) - gray(x, y - 1))) / 510;
      (x >= 16 && x < 48 && y >= 8 && y < 56 ? center : outer).push(gradient);
    }
  }
  const centerEdgeDensity = average(center);
  const outerEdgeDensity = average(outer);
  results.push({ fileName: file.fileName, centerEdgeDensity, outerEdgeDensity, edgeSpread: outerEdgeDensity / Math.max(centerEdgeDensity, 0.0001) });
}
await writeFile(path.join(root, 'tests/results/image-features.json'), `${JSON.stringify({ results }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ total: results.length, averageEdgeSpread: average(results.map((item) => item.edgeSpread)) }, null, 2));

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}
