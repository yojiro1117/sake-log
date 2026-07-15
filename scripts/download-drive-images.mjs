import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const listPath = path.join(repoRoot, 'tests', 'fixtures', 'google-drive-files.json');
const outputDir = path.resolve(repoRoot, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp');
const files = JSON.parse(await readFile(listPath, 'utf8'));

await mkdir(outputDir, { recursive: true });

const concurrency = Math.max(1, Math.min(8, Number(process.env.DRIVE_DOWNLOAD_CONCURRENCY ?? 6)));
const duplicateNames = new Set(
  [...files.reduce((counts, file) => counts.set(file.fileName, (counts.get(file.fileName) ?? 0) + 1), new Map())]
    .filter(([, count]) => count > 1)
    .map(([fileName]) => fileName)
);

const results = new Array(files.length);
let nextIndex = 0;

async function downloadNext() {
  while (nextIndex < files.length) {
    const index = nextIndex++;
    const file = files[index];
    const localFileName = duplicateNames.has(file.fileName)
      ? `${file.driveFileId}__${file.fileName}`
      : file.fileName;
    const output = path.join(outputDir, localFileName);
    try {
      const existing = await stat(output).catch(() => undefined);
      if (existing && existing.size > 0) {
        results[index] = { ...file, localFileName, status: 'already-present', bytes: existing.size };
        continue;
      }

      const url = `https://drive.google.com/uc?export=download&id=${file.driveFileId}`;
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) {
        results[index] = { ...file, localFileName, status: 'failed', httpStatus: response.status, statusText: response.statusText };
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(output, buffer);
      results[index] = { ...file, localFileName, status: 'downloaded', bytes: buffer.byteLength };
      console.log(`${index + 1}/${files.length} ${localFileName}: downloaded ${buffer.byteLength} bytes`);
    } catch (error) {
      results[index] = { ...file, localFileName, status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => downloadNext()));

await writeFile(path.join(outputDir, 'download-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

const failed = results.filter((item) => item.status === 'failed');
console.log(JSON.stringify({ total: results.length, failed: failed.length, concurrency, outputDir }, null, 2));
if (failed.length) process.exitCode = 1;
