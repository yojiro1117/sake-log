import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const imageDir = path.resolve(root, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp');
const filesPath = path.join(root, 'tests/fixtures/google-drive-files.json');
const oldTruthPath = path.join(root, 'tests/fixtures/brand-identification-ground-truth.json');
const files = JSON.parse(await readFile(filesPath, 'utf8'));
const oldTruth = JSON.parse(await readFile(oldTruthPath, 'utf8').catch(() => '[]'));
const downloads = JSON.parse(await readFile(path.join(imageDir, 'download-results.json'), 'utf8').catch(() => '[]'));
const downloadById = new Map(downloads.map((item) => [item.driveFileId, item]));
const oldById = new Map(oldTruth.map((item) => [item.fileId ?? item.driveFileId, item]));
const oldByHash = new Map(oldTruth.filter((item) => item.imageHash).map((item) => [item.imageHash, item]));

const manifest = [];
for (const file of files) {
  const downloaded = downloadById.get(file.driveFileId);
  const localFileName = downloaded?.localFileName ?? file.fileName;
  const localPath = path.join(imageDir, localFileName);
  const fileStat = await stat(localPath).catch(() => undefined);
  const bytes = fileStat ? await readFile(localPath) : undefined;
  const sha256 = bytes ? createHash('sha256').update(bytes).digest('hex') : '';
  manifest.push({
    driveFileId:file.driveFileId,
    fileName:file.fileName,
    mimeType:file.mimeType,
    fileSize:fileStat?.size ?? file.driveSize,
    createdTime:file.createdTime,
    modifiedTime:file.modifiedTime,
    sha256,
    detectedFormat:detectFormat(file.fileName, file.mimeType),
    downloadStatus:downloaded?.status ?? (fileStat ? 'present' : 'failed'),
    duplicateType:'none',
    duplicateOf:null,
    processingStatus:fileStat ? 'ready' : 'failed',
    error:downloaded?.error ?? (fileStat ? null : 'temporary image is missing')
  });
}

const firstByHash = new Map();
for (const item of manifest) {
  if (!item.sha256) continue;
  const first = firstByHash.get(item.sha256);
  if (first) { item.duplicateType = 'exact'; item.duplicateOf = first.driveFileId; }
  else firstByHash.set(item.sha256, item);
}

const draftTruth = manifest.map((item) => {
  const prior = oldById.get(item.driveFileId) ?? oldByHash.get(item.sha256);
  if (!prior) return unknownTruth(item);
  return {
    driveFileId:item.driveFileId,
    fileName:item.fileName,
    imageHash:item.sha256,
    groupId:prior.groupId,
    imageType:prior.imageType,
    expectedBrandFamily:prior.expectedBrandFamily,
    expectedProductName:prior.expectedProductName,
    expectedVariant:prior.expectedVariant,
    expectedMakerName:prior.expectedMakerName,
    expectedAlcoholType:prior.expectedAlcoholType,
    expectedVolumeMl:prior.expectedVolumeMl,
    expectedAbv:prior.expectedAbv,
    expectedJanCode:prior.expectedJanCode,
    visibleText:prior.visibleText,
    difficulty:prior.difficulty,
    groundTruthStatus:normalizeStatus(prior.groundTruthStatus),
    confirmationMethod:prior.fileId === item.driveFileId ? 'previous-human-review-by-drive-id' : 'sha256-identical-to-human-reviewed-image',
    notes:prior.notes
  };
});

const groupSplits = splitGroups(draftTruth);
const groundTruth = draftTruth.map((item) => ({ ...item, split:groupSplits.get(item.groupId) }));

await writeJson(path.join(root, 'tests/fixtures/drive-all-images-manifest.json'), manifest);
await writeJson(path.join(root, 'tests/fixtures/product-identification-ground-truth.json'), groundTruth);
console.log(JSON.stringify({
  scanned:files.length,
  downloaded:manifest.filter((item) => item.downloadStatus !== 'failed').length,
  failed:manifest.filter((item) => item.downloadStatus === 'failed').length,
  exactDuplicates:manifest.filter((item) => item.duplicateType === 'exact').length,
  uniqueImages:new Set(manifest.map((item) => item.sha256).filter(Boolean)).size,
  statuses:countBy(groundTruth, 'groundTruthStatus'),
  splits:countBy(groundTruth, 'split')
}, null, 2));

function unknownTruth(item) {
  return {
    driveFileId:item.driveFileId,
    fileName:item.fileName,
    imageHash:item.sha256,
    groupId:`unknown-${item.sha256.slice(0, 12) || item.driveFileId}`,
    imageType:'unknown',
    groundTruthStatus:'unknown',
    confirmationMethod:'not-reviewed',
    difficulty:'unknown',
    notes:'画像から確実な正解を確認していないため、精度評価の分母には含めない。'
  };
}

function normalizeStatus(status) {
  if (status === 'partially_confirmed') return 'partiallyConfirmed';
  return status ?? 'unknown';
}

function detectFormat(fileName, mimeType) {
  if (/\.hei[cf]$/i.test(fileName) || /hei[cf]/i.test(mimeType ?? '')) return 'HEIC/HEIF';
  if (/\.jpe?g$/i.test(fileName) || mimeType === 'image/jpeg') return 'JPEG';
  if (/\.png$/i.test(fileName)) return 'PNG';
  if (/\.webp$/i.test(fileName)) return 'WebP';
  return 'other';
}

function splitGroups(items) {
  const sizes = new Map();
  for (const item of items) sizes.set(item.groupId, (sizes.get(item.groupId) ?? 0) + 1);
  const totals = { tuning:Math.round(items.length * 0.6), validation:Math.round(items.length * 0.2), holdout:items.length - Math.round(items.length * 0.6) - Math.round(items.length * 0.2) };
  const counts = { tuning:0, validation:0, holdout:0 };
  const result = new Map();
  for (const [groupId, size] of [...sizes].sort(([left], [right]) => stableHash(left).localeCompare(stableHash(right)))) {
    const split = ['tuning','validation','holdout'].sort((left, right) => (totals[right] - counts[right]) / totals[right] - (totals[left] - counts[left]) / totals[left])[0];
    result.set(groupId, split); counts[split] += size;
  }
  return result;
}

function stableHash(value) { return createHash('sha256').update(`sake-log-local-lens-v1:${value}`).digest('hex'); }
function countBy(items, key) { return Object.fromEntries([...items.reduce((map, item) => map.set(item[key], (map.get(item[key]) ?? 0) + 1), new Map())]); }
async function writeJson(target, value) { await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
