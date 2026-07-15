import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'tests/results/visual-matching-validation.json');
const payload = JSON.parse(await readFile(filePath, 'utf8'));
const threshold = 0.84;
const records = payload.composite.records.map((record) => {
  const displayed = record.similarity >= threshold;
  return {
    ...record,
    topGroupId: displayed ? record.topGroupId : undefined,
    referenceDriveFileId: displayed ? record.referenceDriveFileId : undefined,
    correct: displayed && record.topGroupId === record.expectedGroupId,
    abstained: !displayed
  };
});
const count = records.length || 1;
payload.composite = {
  ...payload.composite,
  threshold,
  summary: {
    evaluated: records.length,
    top1Accuracy: records.filter((item) => item.correct).length / count,
    falsePositiveRate: records.filter((item) => !item.correct && !item.abstained).length / count,
    abstentionRate: records.filter((item) => item.abstained).length / count
  },
  records
};
payload.improvement = {
  top1AccuracyPoints: Number(((payload.composite.summary.top1Accuracy - payload.legacy.summary.top1Accuracy) * 100).toFixed(2)),
  falsePositivePoints: Number(((payload.composite.summary.falsePositiveRate - payload.legacy.summary.falsePositiveRate) * 100).toFixed(2))
};
payload.recalibratedAt = new Date().toISOString();
payload.recalibrationSource = 'Stored all-image similarity records from the 0.78 run; no image was decoded again.';
await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload.composite.summary));
