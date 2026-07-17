import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const catalogDir = new URL('../public/catalog/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', catalogDir), 'utf8'));
if (!manifest.version || !manifest.embeddingModel || !manifest.embeddingVersion) throw new Error('Catalog manifest visual schema is incomplete.');
if (manifest.referenceCount !== 0 || manifest.imageDataIncluded !== false) throw new Error('Built-in catalog must not distribute unlicensed product reference images.');
for (const item of manifest.files ?? []) {
  const data = await readFile(new URL(item.name, catalogDir));
  const digest = createHash('sha256').update(data).digest('hex');
  if (digest !== item.sha256) throw new Error(`Catalog checksum mismatch: ${item.name}`);
}
const catalogFiles = await readdir(catalogDir);
const leakedImages = catalogFiles.filter((name) => /\.(?:heic|heif|jpe?g|png|webp)$/i.test(name));
if (leakedImages.length) throw new Error(`Product images found in catalog: ${leakedImages.join(', ')}`);
const license = await readFile(new URL('../docs/visual-product-recognition-licenses.md', import.meta.url), 'utf8');
for (const required of ['Apple Vision', 'ML Kit', 'Tesseract.js', 'Deliberately not bundled']) {
  if (!license.includes(required)) throw new Error(`Visual recognition license note is missing: ${required}`);
}
console.log(JSON.stringify({ catalogVersion:manifest.version, productCount:manifest.productCount, referenceCount:manifest.referenceCount, leakedImages:0 }));
