import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const cycles = await Promise.all([1, 2, 3].map((cycle) => readJson(`tests/results/ocr-cycle-${cycle}.json`)));
const manifest = await readJson('tests/fixtures/google-drive-test-manifest.json');
const byCycle = cycles.map((document) => new Map(document.results.map((item) => [item.fileName, item])));

const results = manifest.map((item) => {
  const sources = byCycle.map((items) => items.get(item.fileName)?.best).filter(Boolean);
  const textParts = sources.map((source) => source.text?.trim()).filter(Boolean);
  const normalizedParts = [...new Set(textParts)];
  const confidence = sources.length ? Math.max(...sources.map((source) => source.confidence ?? 0)) : 0;
  const time = byCycle.reduce((sum, items) => sum + (items.get(item.fileName)?.processingTimeMs ?? 0), 0);
  return {
    fileName: item.fileName,
    status: normalizedParts.length ? 'success' : 'warning',
    bestCycle: 'combined',
    bestVariant: sources.map((source) => source.variant).join('+'),
    ocrText: normalizedParts.join('\n--- OCR VARIANT ---\n'),
    ocrConfidence: confidence,
    detectedProductName: undefined,
    detectedMakerName: undefined,
    detectedAlcoholType: undefined,
    candidateReasons: ['複数前処理結果を統合'],
    candidateCount: 0,
    processingTimeMs: time,
    warnings: normalizedParts.length ? [] : ['OCR空結果'],
    errors: item.errors ?? []
  };
});

const resultByFile = new Map(results.map((item) => [item.fileName, item]));
const mergedManifest = manifest.map((item) => {
  const result = resultByFile.get(item.fileName);
  return { ...item, ocrStatus: result.status, ocrText: result.ocrText, ocrConfidence: result.ocrConfidence, processingTimeMs: result.processingTimeMs };
});
const times = results.map((item) => item.processingTimeMs);
const summary = {
  totalImages: results.length,
  textHitRate: results.filter((item) => item.ocrText).length / results.length,
  emptyResultRate: results.filter((item) => !item.ocrText).length / results.length,
  averageProcessingTimeMs: Math.round(times.reduce((sum, value) => sum + value, 0) / Math.max(times.length, 1)),
  maxProcessingTimeMs: Math.max(...times, 0),
  aggregation: 'Distinct text from original, center-label and label-band OCR passes'
};

await writeFile(path.join(root, 'tests/results/ocr-final.json'), `${JSON.stringify({ summary, results }, null, 2)}\n`);
await writeFile(path.join(root, 'tests/fixtures/google-drive-test-manifest.json'), `${JSON.stringify(mergedManifest, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
