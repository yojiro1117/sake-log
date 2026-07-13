import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const listPath = path.join(repoRoot, 'tests', 'fixtures', 'google-drive-files.json');
const outputDir = path.resolve(repoRoot, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp');
const files = JSON.parse(await readFile(listPath, 'utf8'));

await mkdir(outputDir, { recursive: true });

const results = [];
for (const file of files) {
  const output = path.join(outputDir, file.fileName);
  const existing = await stat(output).catch(() => undefined);
  if (existing && existing.size > 0) {
    results.push({ fileName: file.fileName, status: 'already-present', bytes: existing.size });
    continue;
  }

  const url = `https://drive.google.com/uc?export=download&id=${file.driveFileId}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    results.push({ fileName: file.fileName, status: 'failed', httpStatus: response.status, statusText: response.statusText });
    continue;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(output, buffer);
  results.push({ fileName: file.fileName, status: 'downloaded', bytes: buffer.byteLength });
  console.log(`${file.fileName}: downloaded ${buffer.byteLength} bytes`);
}

const failed = results.filter((item) => item.status === 'failed');
console.log(JSON.stringify({ total: results.length, failed: failed.length, outputDir }, null, 2));
if (failed.length) process.exitCode = 1;
