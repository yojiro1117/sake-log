import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const fixtures = path.join(root, 'tests', 'fixtures');
const results = path.join(root, 'tests', 'results');
const truth = JSON.parse(await readFile(path.join(fixtures, 'product-identification-ground-truth.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(fixtures, 'drive-all-images-manifest.json'), 'utf8'));
const ocr = JSON.parse(await readFile(path.join(results, 'ocr-final.json'), 'utf8'));

assert(truth.length === 151, `ground truth count ${truth.length} != 151`);
assert(manifest.length === 151, `manifest count ${manifest.length} != 151`);
assert(ocr.results?.length === 151, `OCR result count ${ocr.results?.length} != 151`);
assert(new Set(truth.map((item) => item.driveFileId)).size === 151, 'Drive IDs are not unique');
assert(ocr.summary?.heicConversionSuccessRate === 1, 'HEIC conversion validation is incomplete');

for (let cycle = 1; cycle <= 6; cycle += 1) {
  const payload = JSON.parse(await readFile(path.join(results, `identification-cycle-${cycle}.json`), 'utf8'));
  assert(payload.cycle === cycle, `identification cycle ${cycle} is missing or mismatched`);
  assert(Array.isArray(payload.records), `identification cycle ${cycle} has no records`);
}

const fixtureFiles = await readdir(fixtures);
const driveFileNames = new Set(manifest.map((item) => item.fileName));
const driveIds = new Set(manifest.map((item) => item.driveFileId));
const leakedDriveImages = fixtureFiles.filter((file) => {
  if (!/\.(?:hei[cf]|jpe?g|png|webp)$/i.test(file)) return false;
  return driveFileNames.has(file) || [...driveIds].some((id) => file.startsWith(`${id}__`));
});
assert(leakedDriveImages.length === 0, `Drive image binaries must not be committed: ${leakedDriveImages.join(', ')}`);

console.log(JSON.stringify({ images:151, heic:ocr.summary.heicImages, jpeg:ocr.summary.jpegImages, cycles:6, leakedDriveImages:0 }));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
