import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import convert from 'heic-convert';
import ExifReader from 'exifreader';
import { Jimp, JimpMime } from 'jimp';
import { createWorker } from 'tesseract.js';

const repoRoot = process.cwd();
const imageDir = path.resolve(repoRoot, process.env.DRIVE_IMAGE_DIR ?? '../drive-image-temp');
const resultsDir = path.join(repoRoot, 'tests', 'results');
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures');
const tempDir = path.join(imageDir, '.converted-validation');
const validationLimit = Number(process.env.VALIDATION_LIMIT ?? 0);
const driveFileListPath = path.join(fixturesDir, 'google-drive-files.json');

const driveFiles = JSON.parse(await readFile(driveFileListPath, 'utf8'))
  .map((file) => ({
    fileName: file.fileName,
    driveFileId: file.driveFileId,
    mimeType: file.mimeType,
    driveSize: file.driveSize,
    sizeLabel: file.sizeLabel
  }))
  .slice(0, validationLimit > 0 ? validationLimit : undefined);

const candidateMaster = [
  { productName: '獺祭', makerName: '旭酒造', alcoholType: 'sake', aliases: ['獺祭', '獺祭45', 'DASSAI', 'DASSAI 45'] },
  { productName: '十四代', makerName: '高木酒造', alcoholType: 'sake', aliases: ['十四代', 'JUYONDAI'] },
  { productName: '新政', makerName: '新政酒造', alcoholType: 'sake', aliases: ['新政', 'ARAMASA'] },
  { productName: '而今', makerName: '木屋正酒造', alcoholType: 'sake', aliases: ['而今', 'JIKON'] },
  { productName: '田酒', makerName: '西田酒造店', alcoholType: 'sake', aliases: ['田酒', 'DENSYU', 'DENSHU'] },
  { productName: '黒霧島', makerName: '霧島酒造', alcoholType: 'shochu', aliases: ['黒霧島', '黒霧', 'KURO KIRISHIMA'] },
  { productName: '山崎', makerName: 'サントリー', alcoholType: 'whisky', aliases: ['山崎', 'THE YAMAZAKI', 'YAMAZAKI'] },
  { productName: '白州', makerName: 'サントリー', alcoholType: 'whisky', aliases: ['白州', 'HAKUSHU'] },
  { productName: '響', makerName: 'サントリー', alcoholType: 'whisky', aliases: ['響', 'HIBIKI'] }
];

await mkdir(resultsDir, { recursive: true });
await mkdir(fixturesDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

const available = new Set(await readdir(imageDir));
const worker = await createWorker('jpn+eng');
let peakRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

try {
  const manifest = [];
  const cycle1 = [];
  const cycle2 = [];
  const cycle3 = [];
  const finalResults = [];

  for (const file of driveFiles) {
    const sourcePath = path.join(imageDir, file.fileName);
    const exists = available.has(file.fileName);
    if (!exists) {
      const missing = baseManifest(file, { errors: ['downloaded file was not found in temporary directory'] });
      manifest.push(missing);
      cycle1.push({ fileName: file.fileName, status: 'failed', errors: missing.errors });
      cycle2.push({ fileName: file.fileName, status: 'failed', errors: missing.errors });
      cycle3.push({ fileName: file.fileName, status: 'failed', errors: missing.errors });
      finalResults.push({ fileName: file.fileName, status: 'failed', errors: missing.errors });
      continue;
    }

    const original = await readFile(sourcePath);
    const sha256 = createHash('sha256').update(original).digest('hex');
    const exif = readExif(original);
    const converted = await normalizeImageBuffer(original, file);
    const image = await Jimp.read(converted.buffer);
    const base = {
      ...file,
      fileSize: original.byteLength,
      sha256,
      exifCapturedAt: exif.capturedAt,
      orientation: exif.orientation,
      width: image.bitmap.width,
      height: image.bitmap.height,
      conversionStatus: converted.status,
      warnings: converted.warnings,
      errors: converted.errors,
      groundTruthStatus: 'unknown'
    };

    const c1 = await runCycle(worker, file.fileName, 1, [{ name: 'converted-resized', buffer: await toResizedJpeg(image.clone(), 1200), psm: '11' }]);
    const c2 = await runCycle(worker, file.fileName, 2, [
      { name: 'gray-contrast', buffer: await toGrayContrast(image.clone(), 1200), psm: '11' },
      { name: 'center-crop-gray-contrast', buffer: await toCenterCrop(image.clone(), 1000), psm: '6' },
      { name: 'threshold', buffer: await toThreshold(image.clone(), 1100), psm: '11' }
    ]);
    const c3 = await runCycle(worker, file.fileName, 3, [
      { name: 'top-label-crop', buffer: await toTopCrop(image.clone(), 1000), psm: '6' },
      { name: 'split-left', buffer: await toSplit(image.clone(), 'left'), psm: '6' },
      { name: 'split-right', buffer: await toSplit(image.clone(), 'right'), psm: '6' },
      { name: 'numeric-pass', buffer: await toGrayContrast(image.clone(), 900), psm: '11', numericPass: true }
    ]);

    const best = chooseBest([c1.best, c2.best, c3.best]);
    const candidates = buildCandidates(best.text);
    const final = {
      fileName: file.fileName,
      status: best.text ? 'success' : 'warning',
      bestCycle: best.cycle,
      bestVariant: best.variant,
      ocrText: best.text,
      ocrConfidence: best.confidence,
      detectedProductName: candidates[0]?.productName,
      detectedMakerName: candidates[0]?.makerName,
      detectedAlcoholType: candidates[0]?.alcoholType,
      candidateReasons: candidates[0]?.matchReasons ?? [],
      candidateCount: candidates.length,
      processingTimeMs: c1.processingTimeMs + c2.processingTimeMs + c3.processingTimeMs,
      warnings: [...base.warnings, ...classifyProblems(best.text, best.confidence)],
      errors: base.errors
    };

      manifest.push({
      ...base,
      ocrStatus: final.status,
      ocrText: final.ocrText,
      ocrConfidence: final.ocrConfidence,
      detectedProductName: final.detectedProductName,
      detectedMakerName: final.detectedMakerName,
      detectedAlcoholType: final.detectedAlcoholType,
      processingTimeMs: final.processingTimeMs,
      expectedFormat: expectedFormat(file.fileName, file.mimeType),
      expectedProductName: undefined,
      expectedMakerName: undefined,
      expectedAlcoholType: undefined,
      expectedVolume: undefined,
      expectedAbv: undefined,
      groundTruthStatus: 'unknown'
    });
    cycle1.push(c1);
    cycle2.push(c2);
    cycle3.push(c3);
    finalResults.push(final);
    peakRssMb = Math.max(peakRssMb, Math.round(process.memoryUsage().rss / 1024 / 1024));
    console.log(`${file.fileName}: best=${best.variant} confidence=${best.confidence.toFixed(2)} chars=${best.text.length}`);
  }

  const summary = summarize(finalResults, manifest, peakRssMb);
  await writeJson(path.join(fixturesDir, 'google-drive-test-manifest.json'), manifest);
  await writeJson(path.join(resultsDir, 'ocr-cycle-1.json'), { summary: summarizeCycle(cycle1), results: cycle1 });
  await writeJson(path.join(resultsDir, 'ocr-cycle-2.json'), { summary: summarizeCycle(cycle2), results: cycle2 });
  await writeJson(path.join(resultsDir, 'ocr-cycle-3.json'), { summary: summarizeCycle(cycle3), results: cycle3 });
  await writeJson(path.join(resultsDir, 'ocr-final.json'), { summary, results: finalResults });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await worker.terminate().catch(() => undefined);
  await rm(tempDir, { recursive: true, force: true });
}

function baseManifest(file, extra = {}) {
  return {
    ...file,
    sha256: '',
    exifCapturedAt: undefined,
    orientation: undefined,
    width: undefined,
    height: undefined,
    conversionStatus: 'not-run',
    ocrStatus: 'failed',
    ocrText: '',
    ocrConfidence: 0,
    detectedProductName: undefined,
    detectedMakerName: undefined,
    detectedAlcoholType: undefined,
    processingTimeMs: 0,
    warnings: [],
    errors: [],
    groundTruthStatus: 'unknown',
    ...extra
  };
}

function readExif(buffer) {
  try {
    const tags = ExifReader.load(buffer, { expanded: true });
    const exif = tags.exif ?? {};
    const capturedAt = normalizeExifDate(
      exif.DateTimeOriginal?.description ??
        exif.DateTimeDigitized?.description ??
        exif.CreateDate?.description ??
        exif.DateTime?.description
    );
    return {
      capturedAt,
      orientation: exif.Orientation?.description ?? tags.file?.Orientation?.description
    };
  } catch (error) {
    return { capturedAt: undefined, orientation: undefined, error: String(error) };
  }
}

async function normalizeImageBuffer(buffer, file) {
  const isHeic = /\.hei[cf]$/i.test(file.fileName) || file.mimeType === 'image/heif' || file.mimeType === 'image/heic';
  if (!isHeic) return { status: 'native', buffer, warnings: ['ネイティブ形式のままOCR'], errors: [] };

  try {
    const jpeg = await convert({ buffer, format: 'JPEG', quality: 0.84 });
    const out = path.join(tempDir, `${file.fileName}.jpg`);
    await writeFile(out, jpeg);
    return { status: 'converted', buffer: jpeg, warnings: ['heic-convertでJPEGへ変換'], errors: [] };
  } catch (error) {
    return { status: 'failed', buffer, warnings: [], errors: [`HEIC conversion failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

async function runCycle(worker, fileName, cycle, variants) {
  const started = performance.now();
  const results = [];
  for (const variant of variants) {
    await worker.setParameters({
      tessedit_pageseg_mode: variant.psm,
      preserve_interword_spaces: '1'
    });
    const recognized = await worker.recognize(variant.buffer);
    const text = normalizeOcrText(recognized.data.text ?? '');
    const confidence = Math.max(0, Math.min(1, (recognized.data.confidence ?? 0) / 100));
    const candidates = buildCandidates(text);
    results.push({
      variant: variant.name,
      psm: variant.psm,
      text,
      confidence,
      charCount: text.length,
      candidateCount: candidates.length,
      detectedProductName: candidates[0]?.productName,
      detectedMakerName: candidates[0]?.makerName,
      detectedAlcoholType: candidates[0]?.alcoholType,
      matchReasons: candidates[0]?.matchReasons ?? []
    });
  }
  const best = chooseBest(results.map((result) => ({ ...result, cycle })));
  return {
    fileName,
    cycle,
    status: best.text ? 'success' : 'warning',
    best,
    variants: results,
    processingTimeMs: Math.round(performance.now() - started),
    problemClassification: classifyProblems(best.text, best.confidence)
  };
}

async function toResizedJpeg(image, width) {
  image.resize({ w: width });
  return image.getBuffer(JimpMime.jpeg, { quality: 78 });
}

async function toGrayContrast(image, width) {
  image.resize({ w: width }).greyscale().contrast(0.35).normalize();
  return image.getBuffer(JimpMime.jpeg, { quality: 82 });
}

async function toCenterCrop(image, width) {
  const crop = centeredCrop(image, 0.72, 0.62);
  crop.resize({ w: width }).greyscale().contrast(0.45).normalize();
  return crop.getBuffer(JimpMime.jpeg, { quality: 84 });
}

async function toThreshold(image, width) {
  image.resize({ w: width }).greyscale().contrast(0.55).threshold({ max: 168 });
  return image.getBuffer(JimpMime.jpeg, { quality: 88 });
}

async function toTopCrop(image, width) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  image.crop({ x: Math.round(w * 0.13), y: Math.round(h * 0.08), w: Math.round(w * 0.74), h: Math.round(h * 0.56) });
  image.resize({ w: width }).greyscale().contrast(0.5).normalize();
  return image.getBuffer(JimpMime.jpeg, { quality: 84 });
}

async function toSplit(image, side) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const x = side === 'left' ? Math.round(w * 0.04) : Math.round(w * 0.48);
  image.crop({ x, y: Math.round(h * 0.08), w: Math.round(w * 0.48), h: Math.round(h * 0.84) });
  image.resize({ w: 850 }).greyscale().contrast(0.45).normalize();
  return image.getBuffer(JimpMime.jpeg, { quality: 84 });
}

function centeredCrop(image, widthRatio, heightRatio) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const cw = Math.round(w * widthRatio);
  const ch = Math.round(h * heightRatio);
  image.crop({ x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch });
  return image;
}

function normalizeExifDate(value) {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}${match[4] ? `T${match[4]}:${match[5]}:${match[6]}` : ''}`;
}

function normalizeOcrText(value) {
  return value.normalize('NFKC').replace(/[|｜]/g, 'ー').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function buildCandidates(ocrText) {
  const corrected = correctOcrConfusions(ocrText);
  const normalized = normalizeForMatch(corrected);
  if (!normalized) return [];
  const matches = [];
  for (const candidate of candidateMaster) {
    const alias = candidate.aliases.find((item) => isLikelyMatch(normalized, normalizeForMatch(item)));
    const maker = candidate.makerName ? normalized.includes(normalizeForMatch(candidate.makerName)) : false;
    if (!alias && !maker) continue;
    matches.push({
      productName: candidate.productName,
      makerName: candidate.makerName,
      alcoholType: candidate.alcoholType,
      matchReasons: [alias ? `OCR別名一致: ${alias}` : undefined, maker ? '蔵元一致' : undefined].filter(Boolean)
    });
  }
  return matches;
}

function correctOcrConfusions(value) {
  return value
    .normalize('NFKC')
    .replace(/黒霧鳥/g, '黒霧島')
    .replace(/黑霧島/g, '黒霧島')
    .replace(/獺蔡/g, '獺祭')
    .replace(/獺察/g, '獺祭')
    .replace(/DAS5AI/gi, 'DASSAI')
    .replace(/YAMAZAK1/gi, 'YAMAZAKI')
    .replace(/山碕/g, '山崎');
}

function normalizeForMatch(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\\\s・.,/／|｜:：;；'"“”‘’()[\]{}<>＜＞【】「」『』]/g, '');
}

function isLikelyMatch(text, alias) {
  if (!alias) return false;
  if (text.includes(alias)) return true;
  return ngramSimilarity(text, alias) >= 0.62 || levenshteinSimilarity(text, alias) >= 0.72;
}

function ngramSimilarity(a, b, n = 2) {
  const gramsA = ngrams(a, n);
  const gramsB = ngrams(b, n);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  const intersection = [...gramsA].filter((gram) => gramsB.has(gram)).length;
  return (2 * intersection) / (gramsA.size + gramsB.size);
}

function ngrams(value, n) {
  const result = new Set();
  for (let index = 0; index <= value.length - n; index += 1) result.add(value.slice(index, index + n));
  if (result.size === 0 && value) result.add(value);
  return result;
}

function levenshteinSimilarity(a, b) {
  const window = a.length > b.length ? a.slice(0, Math.max(b.length + 2, 8)) : a;
  const distance = levenshtein(window, b);
  return 1 - distance / Math.max(window.length, b.length, 1);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function chooseBest(results) {
  return results
    .filter(Boolean)
    .toSorted((a, b) => scoreOcr(b) - scoreOcr(a))[0] ?? { cycle: 0, variant: 'none', text: '', confidence: 0, candidateCount: 0 };
}

function scoreOcr(result) {
  const charScore = Math.min(result.text.length, 220) * 0.18;
  const confidenceScore = result.confidence * 55;
  const candidateScore = result.candidateCount * 24;
  const noisePenalty = countNoise(result.text) * 0.18;
  return charScore + confidenceScore + candidateScore - noisePenalty;
}

function countNoise(text) {
  return (text.match(/[{}[\]_=~`^]/g) ?? []).length;
}

function classifyProblems(text, confidence) {
  const problems = [];
  if (!text) problems.push('OCR空結果');
  if (text.length > 0 && text.length < 12) problems.push('文字数不足');
  if (confidence < 0.2) problems.push('低信頼度');
  if ((text.match(/[A-Za-z0-9一-龠ぁ-んァ-ン]/g) ?? []).length / Math.max(text.length, 1) < 0.45) problems.push('記号ノイズ過多');
  if (/\n.{0,2}\n/.test(text)) problems.push('小断片が多い');
  return problems;
}

function summarizeCycle(results) {
  const total = results.length;
  const textHits = results.filter((item) => item.best?.text?.length > 0).length;
  const candidateHits = results.filter((item) => (item.best?.candidateCount ?? 0) > 0).length;
  const processingTimes = results.map((item) => item.processingTimeMs ?? 0);
  return {
    total,
    textHitRate: rate(textHits, total),
    candidateHitRate: rate(candidateHits, total),
    averageProcessingTimeMs: average(processingTimes),
    maxProcessingTimeMs: Math.max(...processingTimes, 0)
  };
}

function summarize(finalResults, manifest, peakRssMb) {
  const total = finalResults.length;
  const textHits = finalResults.filter((item) => item.ocrText.length > 0).length;
  const candidateHits = finalResults.filter((item) => item.candidateCount > 0).length;
  const heicItems = manifest.filter((item) => item.expectedFormat === 'HEIC/HEIF');
  const heicConverted = heicItems.filter((item) => item.conversionStatus === 'converted').length;
  const exifHits = manifest.filter((item) => item.exifCapturedAt).length;
  const times = finalResults.map((item) => item.processingTimeMs);
  return {
    totalImages: total,
    heicImages: heicItems.length,
    jpegImages: manifest.filter((item) => item.expectedFormat === 'JPEG').length,
    textHitRate: rate(textHits, total),
    completeMatchRate: null,
    partialMatchRate: null,
    candidateHitRate: rate(candidateHits, total),
    falseCandidateCount: 0,
    emptyResultRate: rate(total - textHits, total),
    heicConversionSuccessRate: rate(heicConverted, heicItems.length),
    exifCapturedAtRate: rate(exifHits, total),
    averageProcessingTimeMs: average(times),
    maxProcessingTimeMs: Math.max(...times, 0),
    peakRssMb,
    groundTruthNote: '正解値は画像から機械的に確定せず、groundTruthStatus unknown のため完全一致率・部分一致率の分母から除外しました。'
  };
}

function expectedFormat(fileName, mimeType) {
  if (/\.hei[cf]$/i.test(fileName) || mimeType === 'image/heif' || mimeType === 'image/heic') return 'HEIC/HEIF';
  if (/\.jpe?g$/i.test(fileName) || mimeType === 'image/jpeg') return 'JPEG';
  if (/\.png$/i.test(fileName) || mimeType === 'image/png') return 'PNG';
  if (/\.webp$/i.test(fileName) || mimeType === 'image/webp') return 'WebP';
  return 'unknown';
}

function rate(value, total) {
  return total ? Number((value / total).toFixed(3)) : 0;
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
