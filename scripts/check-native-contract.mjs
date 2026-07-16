import { readFile } from 'node:fs/promises';

const target = process.argv[2] ?? 'all';
const requiredMethods = ['analyzeImage', 'detectLabelRegions', 'recognizeText', 'readBarcodes', 'createImageEmbedding', 'compareImages', 'getCapabilities', 'cancel'];
const checks = [];
if (target === 'ios' || target === 'all') checks.push([
  'ios/App/App/SakeVisionPlugin.swift',
  ['VNRecognizeTextRequest', 'VNDetectBarcodesRequest', 'VNDetectRectanglesRequest', 'VNGenerateImageFeaturePrintRequest', ...requiredMethods]
]);
if (target === 'android' || target === 'all') checks.push([
  'android/app/src/main/java/jp/yojiro/sakelog/SakeVisionPlugin.kt',
  ['JapaneseTextRecognizerOptions', 'TextRecognizerOptions', 'BarcodeScanning', ...requiredMethods]
]);
for (const [path, symbols] of checks) {
  const source = await readFile(path, 'utf8');
  const missing = symbols.filter((symbol) => !source.includes(symbol));
  if (missing.length) throw new Error(`${path}: missing ${missing.join(', ')}`);
}
console.log(`Native contract verified: ${target}`);
