import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { builtInAlcoholProductCatalog } from '../src/data/alcoholProductCatalog';

const version = 'catalog-core-v1';
const output = new URL('../public/catalog/', import.meta.url);
await mkdir(output, { recursive: true });

const core = JSON.stringify(builtInAlcoholProductCatalog);
const jan = Object.fromEntries(builtInAlcoholProductCatalog.flatMap((item) => item.janCodes.map((code) => [code, item.productId])));
const text = Object.fromEntries(builtInAlcoholProductCatalog.flatMap((item) => [
  item.canonicalProductName, item.brandFamily, ...item.aliases, ...item.kanaAliases, ...item.latinAliases, ...item.commonOcrErrors
].map((term) => [term, item.productId])));
const files = [
  ['core-001.json.gz', gzipSync(core)],
  ['jan-index-001.json.gz', gzipSync(JSON.stringify(jan))],
  ['text-index-001.json.gz', gzipSync(JSON.stringify(text))]
] as const;
for (const [name, data] of files) await writeFile(new URL(name, output), data);
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  entries: builtInAlcoholProductCatalog.length,
  files: files.map(([name, data]) => ({ name, bytes: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') })),
  imageDataIncluded: false,
  license: 'Application-maintained factual metadata; no third-party product images.'
};
await writeFile(new URL('manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(new URL('catalog-core.json', output), `${JSON.stringify({ version, entries: builtInAlcoholProductCatalog }, null, 2)}\n`);
await writeFile(new URL('catalog-index.json', output), `${JSON.stringify({ version, jan, text }, null, 2)}\n`);
