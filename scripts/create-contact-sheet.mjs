import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import convert from 'heic-convert';
import { Jimp, JimpMime } from 'jimp';

const root = process.cwd();
const sourceDir = path.resolve(root, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp-qa');
const output = path.resolve(root, process.env.CONTACT_SHEET_PATH ?? '../drive-image-temp-qa/contact-sheet.jpg');
const files = JSON.parse(await readFile(path.join(root, 'tests/fixtures/google-drive-files.json'), 'utf8'));
const selected = [...files.filter((file) => /\.hei[cf]$/i.test(file.fileName)).slice(0, 16), ...files.filter((file) => /\.jpe?g$/i.test(file.fileName)).slice(0, 4)];
const sheet = new Jimp({ width: 1200, height: 1280, color: 0xfffefaff });

for (const [index, file] of selected.entries()) {
  const raw = await readFile(path.join(sourceDir, file.fileName));
  const bytes = /\.hei[cf]$/i.test(file.fileName) ? await convert({ buffer: raw, format: 'JPEG', quality: 0.7 }) : raw;
  const image = await Jimp.read(bytes);
  image.cover({ w: 240, h: 320 });
  sheet.composite(image, (index % 5) * 240, Math.floor(index / 5) * 320);
}

await writeFile(output, await sheet.getBuffer(JimpMime.jpeg, { quality: 82 }));
console.log(JSON.stringify({ output, files: selected.map((file, index) => ({ position: index + 1, fileName: file.fileName })) }, null, 2));
