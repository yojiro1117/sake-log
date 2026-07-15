import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import convert from 'heic-convert';
import { Jimp, JimpMime, loadFont } from 'jimp';

const root = process.cwd();
const sourceDir = path.resolve(root, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp-qa');
const output = path.resolve(root, process.env.CONTACT_SHEET_PATH ?? '../drive-image-temp-qa/contact-sheet.jpg');
const files = JSON.parse(await readFile(path.join(root, 'tests/fixtures/google-drive-files.json'), 'utf8'));
const offset = Number(process.env.CONTACT_SHEET_OFFSET ?? 0);
const count = Number(process.env.CONTACT_SHEET_COUNT ?? 20);
const columns = Number(process.env.CONTACT_SHEET_COLUMNS ?? 4);
const tileWidth = Number(process.env.CONTACT_SHEET_TILE_WIDTH ?? 360);
const tileHeight = Number(process.env.CONTACT_SHEET_TILE_HEIGHT ?? 480);
const labelHeight = 48;
const selected = files.slice(offset, offset + count);
const rows = Math.ceil(selected.length / columns);
const sheet = new Jimp({ width: columns * tileWidth, height: rows * (tileHeight + labelHeight), color: 0xfffefaff });
const fontPath = path.join(root, 'node_modules/.pnpm/@jimp+plugin-print@1.6.1/node_modules/@jimp/plugin-print/dist/fonts/open-sans/open-sans-32-black/open-sans-32-black.fnt');
const font = await loadFont(fontPath);

for (const [index, file] of selected.entries()) {
  const raw = await readFile(path.join(sourceDir, file.fileName));
  const bytes = /\.hei[cf]$/i.test(file.fileName) ? await convert({ buffer: raw, format: 'JPEG', quality: 0.7 }) : raw;
  const image = await Jimp.read(bytes);
  image.contain({ w: tileWidth, h: tileHeight });
  const x = (index % columns) * tileWidth;
  const y = Math.floor(index / columns) * (tileHeight + labelHeight);
  sheet.composite(image, x, y);
  sheet.print({ font, x: x + 8, y: y + tileHeight + 6, text: `${offset + index + 1}. ${file.fileName}`, maxWidth: tileWidth - 16 });
}

await writeFile(output, await sheet.getBuffer(JimpMime.jpeg, { quality: 82 }));
console.log(JSON.stringify({
  output,
  offset,
  files: selected.map((file, index) => ({
    position: index + 1,
    absolutePosition: offset + index + 1,
    fileName: file.fileName
  }))
}, null, 2));
