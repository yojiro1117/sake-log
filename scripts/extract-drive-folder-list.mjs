import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve(process.cwd(), process.argv[2] ?? '../drive-image-temp/folder.html');
const output = path.resolve(process.cwd(), process.argv[3] ?? 'tests/fixtures/google-drive-files.json');
const html = await readFile(input, 'utf8');

const rows = [...html.matchAll(/<tr data-selectable data-id="([^"]+)"[\s\S]*?<strong class="DNoYtb">([^<]+)<\/strong>[\s\S]*?aria-label="Size: ([^"]+)/g)]
  .map((match) => ({
    driveFileId: decodeHtml(match[1]),
    fileName: decodeHtml(match[2]),
    sizeLabel: decodeHtml(match[3].trim()),
    mimeType: inferMimeType(match[2])
  }))
  .filter((file) => /\.(heic|heif|jpe?g|png|webp)$/i.test(file.fileName));

await writeFile(output, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ count: rows.length, output }, null, 2));

function inferMimeType(fileName) {
  if (/\.hei[cf]$/i.test(fileName)) return 'image/heif';
  if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg';
  if (/\.png$/i.test(fileName)) return 'image/png';
  if (/\.webp$/i.test(fileName)) return 'image/webp';
  return 'image/*';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
