import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import convert from 'heic-convert';
import { Jimp } from 'jimp';
import { createVisualFingerprintFromRgba, visualSimilarity } from '../src/services/visualMatching';

const root = process.cwd();
const imageDir = path.resolve(process.env.DRIVE_IMAGE_DIR ?? '../drive-brand-image-temp');
const truth = JSON.parse(await readFile(path.join(root, 'tests/fixtures/brand-identification-ground-truth.json'), 'utf8'));
const fingerprints = new Map<string, ReturnType<typeof createVisualFingerprintFromRgba>>();

for (const item of truth) {
  const original = await readFile(path.join(imageDir, item.fileName));
  const buffer = /\.hei[cf]$/i.test(item.fileName) ? await convert({ buffer: original, format: 'JPEG', quality: 0.75 }) : original;
  const image = await Jimp.read(buffer);
  const aspectRatio = image.bitmap.width / image.bitmap.height;
  image.resize({ w: 17, h: 16 });
  fingerprints.set(item.fileName, createVisualFingerprintFromRgba(image.bitmap.data, aspectRatio));
}

const tuning = truth.filter((item: { split: string; groundTruthStatus: string }) => item.split === 'tuning' && item.groundTruthStatus !== 'unknown');
const references = new Map<string, (typeof tuning)[number]>();
for (const item of tuning) if (!references.has(item.groupId)) references.set(item.groupId, item);
const tests = tuning.filter((item: { fileName: string; groupId: string }) => references.get(item.groupId)?.fileName !== item.fileName);
const records = tests.map((item: { fileName: string; groupId: string }) => {
  const ranked = [...references.values()].map((reference: { fileName: string; groupId: string }) => ({
    groupId: reference.groupId,
    similarity: visualSimilarity(fingerprints.get(item.fileName)!, fingerprints.get(reference.fileName)!)
  })).sort((a, b) => b.similarity - a.similarity);
  const top = ranked[0];
  const displayed = top?.similarity >= 0.78;
  return { fileName: item.fileName, expectedGroupId: item.groupId, topGroupId: displayed ? top.groupId : undefined, similarity: top?.similarity ?? 0, correct: displayed && top.groupId === item.groupId, abstained: !displayed };
});
const summary = {
  images: truth.length,
  confirmedTuningReferences: references.size,
  repeatPhotoTests: records.length,
  top1Accuracy: records.length ? records.filter((item: { correct: boolean }) => item.correct).length / records.length : null,
  falsePositiveRate: records.length ? records.filter((item: { correct: boolean; abstained: boolean }) => !item.correct && !item.abstained).length / records.length : null,
  abstentionRate: records.length ? records.filter((item: { abstained: boolean }) => item.abstained).length / records.length : null,
  threshold: 0.78,
  note: 'Only the first tuning image in each group is used as a confirmed reference; validation and holdout images are not used as references.'
};
await writeFile(path.join(root, 'tests/results/visual-matching-validation.json'), `${JSON.stringify({ summary, records }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
