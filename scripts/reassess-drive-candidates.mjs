import { readFile, writeFile } from 'node:fs/promises';
import { buildCatalogCandidates } from './lib/catalog-candidate-match.mjs';

const finalPath = new URL('../tests/results/ocr-final.json', import.meta.url);
const outputPath = new URL('../tests/results/candidate-cycle-native-boundary.json', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../public/catalog/catalog-core.json', import.meta.url), 'utf8')).entries;
const groundTruth = JSON.parse(await readFile(new URL('../tests/fixtures/product-identification-ground-truth.json', import.meta.url), 'utf8'));
const truthById = new Map(groundTruth.map((record) => [record.driveFileId, record]));
const source = JSON.parse(await readFile(finalPath, 'utf8'));
const results = source.results.map((record) => {
  const candidates = buildCatalogCandidates(record.ocrText ?? '', catalog);
  const truth = truthById.get(record.driveFileId);
  return { ...record, groundTruthStatus:truth?.groundTruthStatus ?? 'unknown', expectedProductName:truth?.expectedProductName, expectedBrandFamily:truth?.expectedBrandFamily, candidateCount: candidates.length, candidates, detectedProductName: candidates[0]?.productName, detectedMakerName: candidates[0]?.makerName, detectedAlcoholType: candidates[0]?.alcoholType, candidateReasons: candidates[0]?.matchReasons ?? [] };
});
const normalize = (value = '') => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
const exactKnown = results.filter((item) => item.groundTruthStatus === 'confirmed' && item.expectedProductName);
const brandKnown = results.filter((item) => item.groundTruthStatus !== 'unknown' && item.expectedBrandFamily);
const unknown = results.filter((item) => item.groundTruthStatus === 'unknown');
const rate = (items, predicate) => items.length ? Number((items.filter(predicate).length / items.length).toFixed(3)) : null;
const summary = {
  totalImages: results.length,
  candidateHitRate: Number((results.filter((item) => item.candidateCount > 0).length / Math.max(1, results.length)).toFixed(3)),
  noCandidateRate: Number((results.filter((item) => item.candidateCount === 0).length / Math.max(1, results.length)).toFixed(3)),
  oneCharacterAliasesRejected: true,
  fuzzyMatchingScope: 'normalized OCR tokens of 2-48 characters',
  groundTruthConfirmed: exactKnown.length,
  groundTruthPartiallyConfirmed: results.filter((item) => item.groundTruthStatus === 'partiallyConfirmed').length,
  exactProductTop1: rate(exactKnown, (item) => normalize(item.detectedProductName) === normalize(item.expectedProductName)),
  brandTop1: rate(brandKnown, (item) => normalize(item.detectedProductName).includes(normalize(item.expectedBrandFamily))),
  falseCandidateCount: brandKnown.filter((item) => item.candidateCount > 0 && !normalize(item.detectedProductName).includes(normalize(item.expectedBrandFamily))).length,
  unknownCandidateCount: unknown.filter((item) => item.candidateCount > 0).length,
  unknownCandidateRate: rate(unknown, (item) => item.candidateCount > 0),
  note: 'Accuracy denominators exclude unknown ground truth; every displayed candidate still requires user confirmation.'
};
await writeFile(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
