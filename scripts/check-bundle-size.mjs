import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const serviceWorker = await readFile(path.join(dist, 'sw.js'), 'utf8');
const urls = [...serviceWorker.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
const uniqueUrls = [...new Set(urls)].filter((url) => !/^https?:/.test(url));
const sizes = await Promise.all(uniqueUrls.map(async (url) => ({ url, bytes:(await stat(path.join(dist, url))).size })));
const totalBytes = sizes.reduce((sum, item) => sum + item.bytes, 0);
const largest = sizes.sort((left, right) => right.bytes - left.bytes)[0];

if (totalBytes > 1_400_000) throw new Error(`precache budget exceeded: ${totalBytes} bytes`);
if (largest && largest.bytes > 700_000) throw new Error(`single precached asset budget exceeded: ${largest.url} (${largest.bytes} bytes)`);
if (/url:"assets\/heic2any-/.test(serviceWorker)) throw new Error('HEIC converter must remain runtime-cached');

console.log(JSON.stringify({ precacheEntries:uniqueUrls.length, totalBytes, largest }));
