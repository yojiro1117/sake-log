import { readFile, writeFile } from 'node:fs/promises';
import { buildCatalogCandidates } from './lib/catalog-candidate-match.mjs';

const finalPath = new URL('../tests/results/ocr-final.json', import.meta.url);
const outputPath = new URL('../tests/results/candidate-cycle-native-boundary.json', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('../public/catalog/catalog-core.json', import.meta.url), 'utf8')).entries;
const source = JSON.parse(await readFile(finalPath, 'utf8'));
const results = source.results.map((record) => {
  const candidates = buildCatalogCandidates(record.ocrText ?? '', catalog);
  return { ...record, candidateCount: candidates.length, candidates, detectedProductName: candidates[0]?.productName, detectedMakerName: candidates[0]?.makerName, detectedAlcoholType: candidates[0]?.alcoholType, candidateReasons: candidates[0]?.matchReasons ?? [] };
});
const summary = {
  totalImages: results.length,
  candidateHitRate: Number((results.filter((item) => item.candidateCount > 0).length / Math.max(1, results.length)).toFixed(3)),
  noCandidateRate: Number((results.filter((item) => item.candidateCount === 0).length / Math.max(1, results.length)).toFixed(3)),
  oneCharacterAliasesRejected: true,
  fuzzyMatchingScope: 'normalized OCR tokens of 2-48 characters',
  groundTruthConfirmed: 0,
  falseCandidateCount: null,
  note: 'No false-candidate rate is claimed because all current ground truth is unknown.'
};
await writeFile(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
