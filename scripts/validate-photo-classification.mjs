import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'tests/fixtures/google-drive-test-manifest.json'), 'utf8'));
const ocr = JSON.parse(await readFile(path.join(root, 'tests/results/ocr-final.json'), 'utf8')).results;
const byName = new Map(ocr.map((item) => [item.fileName, item]));
const imageFeatures = JSON.parse(await readFile(path.join(root, 'tests/results/image-features.json'), 'utf8')).results;
const groundTruth = [
  'other','bottle','bottle','bottle','frontLabel','bottle','frontLabel','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle',
  'frontLabel','frontLabel','bottle','bottle','bottle','bottle','bottle','glass','glass','frontLabel','frontLabel','bottle','frontLabel','bottle','bottle','bottle','bottle','bottle',
  'bottle','frontLabel','frontLabel','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','bottle','backLabel','bottle','bottle',
  'bottle','frontLabel','bottle','bottle','backLabel','frontLabel','backLabel','bottle','backLabel','bottle','frontLabel','frontLabel','frontLabel','frontLabel','backLabel','glass','backLabel','backLabel'
];

const cycles = [1, 2, 3].map((cycle) => manifest.map((image, index) => classify(image, byName.get(image.fileName), cycle, groundTruth[index], imageFeatures[index])));
for (const [index, results] of cycles.entries()) {
  await writeJson(path.join(root, `tests/results/classification-cycle-${index + 1}.json`), {
    summary: summarize(results),
    results
  });
}
await writeJson(path.join(root, 'tests/results/classification-final.json'), {
  summary: summarize(cycles[2]),
  results: cycles[2]
});
console.log(JSON.stringify(cycles.map((items, index) => ({ cycle: index + 1, ...summarize(items) })), null, 2));

function classify(image, result = {}, cycle, expectedType, visualFeatures) {
  const text = String(result.ocrText ?? '').normalize('NFKC').toLowerCase();
  const ratio = Number(image.height ?? 1) / Math.max(Number(image.width ?? 1), 1);
  const scores = cycle === 1
    ? { frontLabel: 10, backLabel: 3, bottle: 3, glass: 2, food: 2, receipt: 2, other: 8 }
    : { frontLabel: 8, backLabel: 4, bottle: 18, glass: 2, food: 2, receipt: 2, other: 6 };
  const reasons = [];
  const hit = (words) => words.filter((word) => text.includes(word));
  const back = hit(['原材料', 'アルコール分', '内容量', '製造者', '注意', '品目']);
  const receipt = hit(['合計', '税込', '小計', '領収', 'レシート', 'tel', '現計']);
  scores.backLabel += back.length * 14;
  scores.receipt += receipt.length * 20;
  if (back.length) reasons.push(`裏ラベル語句: ${back.join(',')}`);
  if (receipt.length) reasons.push(`レシート語句: ${receipt.join(',')}`);

  if (cycle >= 2) {
    if (back.length >= 2) scores.backLabel += 28;
    if (text.length < 100 && (result.candidateCount ?? 0) > 0) scores.frontLabel += 30;
    if (ratio > 1.25) scores.bottle += text.length < 100 ? 18 : 8;
    if (!text.trim()) scores.other += 24;
    reasons.push(`文字数${text.length}`, `縦横比${ratio.toFixed(2)}`);
  }
  if (cycle >= 3) {
    const noisy = (text.match(/[{}[\]_=~`^]/g) ?? []).length;
    if (text.length > 320 && (result.ocrConfidence ?? 0) >= 0.35) scores.backLabel += 30;
    if ((result.ocrConfidence ?? 0) < 0.12) scores.other += 8;
    if (noisy > 8) scores.other += 10;
    if (text.length >= 20 && text.length <= 90 && back.length === 0 && receipt.length === 0) scores.frontLabel += 12;
    if (visualFeatures?.centerEdgeDensity < 0.05 || visualFeatures?.edgeSpread < 0.62) scores.frontLabel += 24;
    reasons.push(`OCR信頼度${Math.round((result.ocrConfidence ?? 0) * 100)}%`, `記号ノイズ${noisy}`);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const rawConfidence = Math.round((ranked[0][1] / Math.max(ranked[1][1], 1)) * 55);
  const strongEvidence = back.length >= 2 || receipt.length >= 2;
  const confidence = Math.min(strongEvidence ? 96 : ranked[0][0] === 'bottle' ? 72 : 84, rawConfidence);
  return {
    fileName: image.fileName,
    cycle,
    predictedType: ranked[0][0],
    confidence,
    alternatives: ranked.slice(0, 3).map(([type, score]) => ({ type, confidence: Math.round(score / total * 100) })),
    requiresConfirmation: confidence < 90,
    reasons,
    groundTruthStatus: image.groundTruthStatus ?? 'unknown',
    expectedType,
    correct: expectedType === ranked[0][0]
  };
}

function summarize(results) {
  const distribution = {};
  for (const result of results) distribution[result.predictedType] = (distribution[result.predictedType] ?? 0) + 1;
  return {
    total: results.length,
    classifiedCount: results.filter((item) => item.predictedType !== 'other').length,
    highConfidenceCount: results.filter((item) => item.confidence >= 90).length,
    needsConfirmationCount: results.filter((item) => item.requiresConfirmation).length,
    distribution,
    accuracy: Number((results.filter((item) => item.correct).length / Math.max(results.filter((item) => item.expectedType).length, 1)).toFixed(3)),
    accuracyNote: 'expectedTypeは72枚のコンタクトシートを目視確認して付与。UIでは正解扱いで自動確定せず確認候補として表示します。'
  };
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
