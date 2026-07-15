import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import convert from 'heic-convert';
import { Jimp } from 'jimp';
import { createVisualFingerprintFromRgba, visualSimilarity } from '../src/services/visualMatching';

type TruthItem = {
  driveFileId: string;
  fileName: string;
  groupId: string;
  split: 'tuning' | 'validation' | 'holdout';
  groundTruthStatus: 'confirmed' | 'partiallyConfirmed' | 'unknown';
};
type DownloadItem = { driveFileId: string; localFileName: string; success: boolean };

const root = process.cwd();
const imageDir = path.resolve(process.env.DRIVE_IMAGE_DIR ?? '../drive-local-lens-temp');
const truth = JSON.parse(await readFile(path.join(root, 'tests/fixtures/product-identification-ground-truth.json'), 'utf8')) as TruthItem[];
const downloads = JSON.parse(await readFile(path.join(imageDir, 'download-results.json'), 'utf8')) as DownloadItem[];
const localNameById = new Map(downloads.filter((item) => item.success).map((item) => [item.driveFileId, item.localFileName]));
const fingerprints = new Map<string, ReturnType<typeof createVisualFingerprintFromRgba>>();
const failures: Array<{ driveFileId: string; fileName: string; error: string }> = [];

for (const item of truth) {
  try {
    const localFileName = localNameById.get(item.driveFileId) ?? item.fileName;
    const original = await readFile(path.join(imageDir, localFileName));
    const buffer = /\.hei[cf]$/i.test(item.fileName)
      ? await convert({ buffer: original, format: 'JPEG', quality: 0.75 })
      : original;
    const image = await Jimp.fromBuffer(buffer, { 'image/jpeg': { maxMemoryUsageInMB: 1024, maxResolutionInMP: 100 } });
    const aspectRatio = image.bitmap.width / image.bitmap.height;
    image.resize({ w: 17, h: 16 });
    fingerprints.set(item.driveFileId, createVisualFingerprintFromRgba(image.bitmap.data, aspectRatio));
  } catch (error) {
    failures.push({ driveFileId: item.driveFileId, fileName: item.fileName, error: error instanceof Error ? error.message : String(error) });
  }
}

const known = truth.filter((item) => item.groundTruthStatus !== 'unknown' && fingerprints.has(item.driveFileId));
const references = new Map<string, TruthItem>();
for (const item of known.filter((candidate) => candidate.split === 'tuning')) {
  if (!references.has(item.groupId)) references.set(item.groupId, item);
}
const tests = known.filter((item) => references.has(item.groupId) && references.get(item.groupId)?.driveFileId !== item.driveFileId);

function legacySimilarity(left: ReturnType<typeof createVisualFingerprintFromRgba>, right: ReturnType<typeof createVisualFingerprintFromRgba>) {
  return visualSimilarity({ ...left, averageHash: undefined, perceptualHash: undefined }, { ...right, averageHash: undefined, perceptualHash: undefined });
}

function evaluate(mode: 'legacy' | 'composite', threshold: number) {
  const records = tests.map((item) => {
    const source = fingerprints.get(item.driveFileId)!;
    const ranked = [...references.values()].map((reference) => ({
      groupId: reference.groupId,
      referenceDriveFileId: reference.driveFileId,
      similarity: mode === 'legacy'
        ? legacySimilarity(source, fingerprints.get(reference.driveFileId)!)
        : visualSimilarity(source, fingerprints.get(reference.driveFileId)!)
    })).sort((left, right) => right.similarity - left.similarity);
    const top = ranked[0];
    const displayed = Boolean(top && top.similarity >= threshold);
    return {
      driveFileId: item.driveFileId,
      fileName: item.fileName,
      split: item.split,
      expectedGroupId: item.groupId,
      topGroupId: displayed ? top.groupId : undefined,
      referenceDriveFileId: displayed ? top.referenceDriveFileId : undefined,
      similarity: top?.similarity ?? 0,
      correct: displayed && top.groupId === item.groupId,
      abstained: !displayed
    };
  });
  const count = records.length || 1;
  return {
    mode,
    threshold,
    summary: {
      evaluated: records.length,
      top1Accuracy: records.filter((item) => item.correct).length / count,
      falsePositiveRate: records.filter((item) => !item.correct && !item.abstained).length / count,
      abstentionRate: records.filter((item) => item.abstained).length / count
    },
    records
  };
}

const legacy = evaluate('legacy', 0.78);
const composite = evaluate('composite', 0.84);
const payload = {
  evaluatedAt: new Date().toISOString(),
  imageCount: truth.length,
  decodedImages: fingerprints.size,
  referenceGroups: references.size,
  failures,
  legacy,
  composite,
  improvement: {
    top1AccuracyPoints: Number(((composite.summary.top1Accuracy - legacy.summary.top1Accuracy) * 100).toFixed(2)),
    falsePositivePoints: Number(((composite.summary.falsePositiveRate - legacy.summary.falsePositiveRate) * 100).toFixed(2))
  },
  note: 'Only user-reviewed tuning images are references. Validation and holdout images never become references.'
};
await writeFile(path.join(root, 'tests/results/visual-matching-validation.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ legacy: legacy.summary, composite: composite.summary, failures: failures.length }, null, 2));
