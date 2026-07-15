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
type DownloadItem = { driveFileId:string; localFileName:string; success?:boolean; status?:string };

const root = process.cwd();
const imageDir = path.resolve(process.env.DRIVE_IMAGE_DIR ?? '../drive-local-lens-temp');
const truth = JSON.parse(await readFile(path.join(root, 'tests/fixtures/product-identification-ground-truth.json'), 'utf8')) as TruthItem[];
const downloads = JSON.parse(await readFile(path.join(imageDir, 'download-results.json'), 'utf8')) as DownloadItem[];
const localNameById = new Map(downloads.filter((item) => item.success || item.status === 'downloaded' || item.status === 'already-present').map((item) => [item.driveFileId, item.localFileName]));
const fingerprints = new Map<string, ReturnType<typeof createVisualFingerprintFromRgba>>();
const cropFingerprints = new Map<string, ReturnType<typeof createVisualFingerprintFromRgba>>();
const failures: Array<{ driveFileId: string; fileName: string; error: string }> = [];

const visualItems = truth.filter((item) => item.groundTruthStatus !== 'unknown' && item.split === 'tuning');
for (const item of visualItems) {
  try {
    const localFileName = localNameById.get(item.driveFileId) ?? item.fileName;
    const original = await readFile(path.join(imageDir, localFileName));
    const buffer = /\.hei[cf]$/i.test(item.fileName)
      ? await convert({ buffer: original, format: 'JPEG', quality: 0.75 })
      : original;
    const image = await Jimp.fromBuffer(buffer, { 'image/jpeg': { maxMemoryUsageInMB: 1024, maxResolutionInMP: 100 } });
    const aspectRatio = image.bitmap.width / image.bitmap.height;
    const center = image.clone();
    center.crop({ x:Math.round(center.bitmap.width * 0.1), y:Math.round(center.bitmap.height * 0.2), w:Math.round(center.bitmap.width * 0.8), h:Math.round(center.bitmap.height * 0.65) });
    const centerAspectRatio = center.bitmap.width / center.bitmap.height;
    center.resize({ w:17, h:16 });
    cropFingerprints.set(item.driveFileId, createVisualFingerprintFromRgba(center.bitmap.data, centerAspectRatio));
    image.resize({ w: 17, h: 16 });
    fingerprints.set(item.driveFileId, createVisualFingerprintFromRgba(image.bitmap.data, aspectRatio));
  } catch (error) {
    failures.push({ driveFileId: item.driveFileId, fileName: item.fileName, error: error instanceof Error ? error.message : String(error) });
  }
}

const known = truth.filter((item) => item.groundTruthStatus !== 'unknown' && fingerprints.has(item.driveFileId));
const references = new Map<string, TruthItem[]>();
for (const item of known.filter((candidate) => candidate.split === 'tuning')) {
  references.set(item.groupId, [...(references.get(item.groupId) ?? []), item]);
}
const tests = known.filter((item) => item.split === 'tuning' && (references.get(item.groupId)?.length ?? 0) > 1);

function legacySimilarity(left: ReturnType<typeof createVisualFingerprintFromRgba>, right: ReturnType<typeof createVisualFingerprintFromRgba>) {
  return visualSimilarity({ ...left, averageHash: undefined, perceptualHash: undefined }, { ...right, averageHash: undefined, perceptualHash: undefined });
}

function evaluate(mode: 'legacy' | 'composite' | 'multi-crop', threshold: number) {
  const records = tests.map((item) => {
    const source = fingerprints.get(item.driveFileId)!;
    const ranked = [...references.entries()].map(([groupId, groupReferences]) => {
      const scored = groupReferences.filter((reference)=>reference.driveFileId!==item.driveFileId).map((reference) => {
        const full = mode === 'legacy'
          ? legacySimilarity(source, fingerprints.get(reference.driveFileId)!)
          : visualSimilarity(source, fingerprints.get(reference.driveFileId)!);
        const crop = mode === 'multi-crop'
          ? visualSimilarity(cropFingerprints.get(item.driveFileId)!, cropFingerprints.get(reference.driveFileId)!)
          : 0;
        return { reference, similarity:Math.max(full, crop * 0.98) };
      }).sort((left,right)=>right.similarity-left.similarity);
      return scored.length ? {
      groupId,
      referenceDriveFileId:scored[0].reference.driveFileId,
      similarity:scored[0].similarity
      } : undefined;
    }).filter((value):value is NonNullable<typeof value>=>Boolean(value)).sort((left, right) => right.similarity - left.similarity);
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
const multiCrop = evaluate('multi-crop', 0.84);
const payload = {
  evaluatedAt: new Date().toISOString(),
  imageCount: truth.length,
  decodedImages: fingerprints.size,
  referenceGroups: references.size,
  failures,
  legacy,
  composite,
  multiCrop,
  improvement: {
    top1AccuracyPoints: Number(((composite.summary.top1Accuracy - legacy.summary.top1Accuracy) * 100).toFixed(2)),
    falsePositivePoints: Number(((composite.summary.falsePositiveRate - legacy.summary.falsePositiveRate) * 100).toFixed(2))
  },
  note: 'Seen-before leave-one-photo-out evaluation. Only other user-reviewed tuning images are references; the query image, validation, and holdout images never become references.'
};
await writeFile(path.join(root, 'tests/results/visual-matching-validation.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ legacy:legacy.summary, composite:composite.summary, multiCrop:multiCrop.summary, failures:failures.length }, null, 2));
