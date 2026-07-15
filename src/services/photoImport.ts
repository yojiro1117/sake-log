import { alcoholLabelCandidates } from '../data/alcoholCandidates';
import { fileToResizedBlob } from './imageService';
import { createOcrVariants, scoreOcrVariant, type OcrVariantKind } from './ocrPreprocessing';
import { scoreCandidate } from './confidenceService';
import { learningCandidates } from './ocrLearning';
import { classifyPhoto, extractVisualImageFeatures } from './photoClassification';
import { db } from '../db/db';
import type { CandidateMatch, ImageType, ImportedPhotoDraft, OcrResult } from '../types';

type DetectedText = { rawValue?: string };
type TextDetectorCtor = new () => { detect: (source: ImageBitmapSource) => Promise<DetectedText[]> };

export const MAX_IMPORT_FILES = 10;

export interface PhotoImportProgress {
  index: number;
  total: number;
  fileName: string;
  phase: 'metadata' | 'image' | 'ocr' | 'candidate' | 'done' | 'failed' | 'cancelled';
  message: string;
  ocrProgress?: number;
}

export async function createImportedPhotoDraftsSequential(
  files: File[],
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: PhotoImportProgress) => void;
    onDraftUpdate?: (draft: ImportedPhotoDraft) => void;
  } = {}
): Promise<{ drafts: ImportedPhotoDraft[]; failures: Array<{ fileName: string; fileKey: string; reason: string }> }> {
  if (files.length > MAX_IMPORT_FILES) throw new Error(`一度に選択できる写真は最大${MAX_IMPORT_FILES}枚です。`);

  const drafts: ImportedPhotoDraft[] = [];
  const failures: Array<{ fileName: string; fileKey: string; reason: string }> = [];

  for (const [index, file] of files.entries()) {
    if (options.signal?.aborted) {
      failures.push({ fileName: file.name, fileKey: photoFileKey(file), reason: '処理をキャンセルしました。' });
      continue;
    }

    try {
      drafts.push(await createImportedPhotoDraft(file, index, files.length, options));
    } catch (error) {
      failures.push({ fileName: file.name, fileKey: photoFileKey(file), reason: error instanceof Error ? error.message : '写真の処理に失敗しました。' });
      options.onProgress?.({
        index,
        total: files.length,
        fileName: file.name,
        phase: options.signal?.aborted ? 'cancelled' : 'failed',
        message: options.signal?.aborted ? '処理をキャンセルしました。' : '写真の処理に失敗しました。'
      });
    }
  }

  return { drafts, failures };
}

async function createImportedPhotoDraft(
  file: File,
  index: number,
  total: number,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: PhotoImportProgress) => void;
    onDraftUpdate?: (draft: ImportedPhotoDraft) => void;
  }
): Promise<ImportedPhotoDraft> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const fileKey = photoFileKey(file);
  assertSupportedImage(file);
  throwIfAborted(options.signal);

  options.onProgress?.({ index, total, fileName: file.name, phase: 'metadata', message: '撮影日を確認中です。' });
  const metadataStarted = performance.now();
  const metadataPromise = readCapturedAt(file);
  const imageHashPromise = hashFile(file);
  const conversionStarted = performance.now();
  const { file: displayFile, warning } = await normalizeImageFile(file);
  const heicConversionMs = performance.now() - conversionStarted;
  const [capturedAt, imageHash] = await Promise.all([metadataPromise, imageHashPromise]);
  const exifMs = performance.now() - metadataStarted;

  throwIfAborted(options.signal);
  options.onProgress?.({ index, total, fileName: file.name, phase: 'image', message: '画像を調整中です。' });
  const resizeStarted = performance.now();
  const resizedBlob = await fileToResizedBlob(displayFile, 1600, 0.86);
  const { width, height } = await readImageSize(resizedBlob);
  const resizeMs = performance.now() - resizeStarted;
  const previewUrl = URL.createObjectURL(resizedBlob);
  const pendingDraft: ImportedPhotoDraft = {
    id,
    fileName: file.name,
    originalFile: file,
    resizedBlob,
    previewUrl,
    capturedAt,
    imageHash,
    width,
    height,
    ocr: { text: '', confidence: 0, engine: 'none', status: 'empty', message: 'OCRをバックグラウンドで処理中です。' },
    candidates: [],
    status: 'processing',
    message: 'プレビューを表示しました。OCRをバックグラウンドで処理中です。',
    imageType: 'other',
    sortOrder: index,
    fileKey,
    classificationConfirmed: false,
    processing: {
      startedAt,
      previewReadyMs: performance.now() - started,
      heicConversionMs,
      exifMs,
      resizeMs,
      originalBytes: file.size,
      processedBytes: resizedBlob.size,
      ocrInputPixels: (width ?? 0) * (height ?? 0),
      preprocessingVariants: 0
    }
  };
  options.onDraftUpdate?.(pendingDraft);

  throwIfAborted(options.signal);
  options.onProgress?.({ index, total, fileName: file.name, phase: 'ocr', message: '文字を読み取り中です。', ocrProgress: 0 });
  const ocrStarted = performance.now();
  const ocr = await readImageText(resizedBlob, {
    signal: options.signal,
    onProgress: (ocrProgress) => {
      options.onProgress?.({
        index,
        total,
        fileName: file.name,
        phase: 'ocr',
        message: '文字を読み取り中です。',
        ocrProgress
      });
    }
  });
  const ocrMs = performance.now() - ocrStarted;

  options.onProgress?.({ index, total, fileName: file.name, phase: 'candidate', message: '候補を確認中です。' });
  const candidateStarted = performance.now();
  const baseCandidates = buildCandidates(ocr.text, ocr.confidence);
  const learnedCandidates = await learningCandidates(ocr.text);
  const candidates = mergeCandidates(learnedCandidates, baseCandidates);
  const candidateMs = performance.now() - candidateStarted;
  const classificationStarted = performance.now();
  const classification = classifyPhoto({
    ocrText: ocr.text,
    width,
    height,
    knownCandidateCount: candidates.length,
    ocrConfidence: ocr.confidence,
    corrections: await db.classificationCorrections.toArray(),
    visualFeatures: await extractVisualImageFeatures(resizedBlob)
  });
  const classificationMs = performance.now() - classificationStarted;
  const status = ocr.status === 'success' && candidates.length > 0 ? 'success' : 'warning';
  const message =
    warning ??
    (ocr.status === 'success' && candidates.length > 0
      ? 'OCR結果から候補を表示しました。内容を確認してください。'
      : '銘柄を特定できませんでした。手入力してください。');

  await db.externalSources.put({
    id: 'diagnostic:last-photo-import',
    type: 'diagnostic',
    payload: {
      fileName: file.name,
      mimeType: file.type || 'unknown',
      capturedAt: capturedAt ?? null,
      width,
      height,
      heicConverted: displayFile !== file,
      ocrEngine: ocr.engine,
      ocrStatus: ocr.status,
      ocrConfidence: Math.round(ocr.confidence * 100),
      ocrTextPreview: ocr.text.slice(0, 160),
      classification: classification.type,
      classificationConfidence: classification.confidence,
      warning: warning ?? null
    },
    createdAt: new Date().toISOString()
  }).catch(() => undefined);

  options.onProgress?.({ index, total, fileName: file.name, phase: 'done', message });

  const completedDraft: ImportedPhotoDraft = {
    ...pendingDraft,
    id,
    fileName: file.name,
    originalFile: file,
    resizedBlob,
    previewUrl,
    capturedAt,
    imageHash,
    width,
    height,
    ocr,
    candidates,
    status,
    message,
    imageType: classification.type,
    classification,
    sortOrder: index,
    fileKey,
    processing: {
      ...pendingDraft.processing!,
      ocrMs,
      candidateMs,
      classificationMs,
      totalMs: performance.now() - started,
      preprocessingVariants: ocr.preprocessing?.length ?? 0
    }
  };
  options.onDraftUpdate?.(completedDraft);
  return completedDraft;
}

export function photoFileKey(file: Pick<File, 'name' | 'size' | 'lastModified'>) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export async function readCapturedAt(file: File): Promise<string | undefined> {
  try {
    const ExifReader = await import('exifreader');
    const tags = await ExifReader.load(file, { expanded: true });
    const exif = tags.exif as Record<string, { description?: string; value?: unknown }> | undefined;
    const source = exif?.DateTimeOriginal?.description ?? exif?.DateTimeDigitized?.description ?? exif?.DateTime?.description;
    return normalizeExifDate(source);
  } catch {
    return undefined;
  }
}

export async function readImageText(
  file: File | Blob,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {}
): Promise<OcrResult> {
  const detectorResult = await tryTextDetector(file);
  if (buildCandidates(detectorResult.text).length > 0 || detectorResult.text.trim().length >= 16) return detectorResult;

  try {
    return await readWithTesseractVariants(file, options);
  } catch (error) {
    if (options.signal?.aborted) {
      return { text: '', confidence: 0, engine: 'tesseract', status: 'cancelled', message: 'OCR処理をキャンセルしました。' };
    }
    return {
      text: detectorResult.text,
      confidence: detectorResult.confidence,
      engine: detectorResult.engine === 'none' ? 'tesseract' : detectorResult.engine,
      status: detectorResult.text ? 'empty' : 'failed',
      message: error instanceof Error ? error.message : '文字を読み取れませんでした。'
    };
  }
}

async function tryTextDetector(file: File | Blob): Promise<OcrResult> {
  const Detector = (globalThis as unknown as { TextDetector?: TextDetectorCtor }).TextDetector;
  if (!Detector) return { text: '', confidence: 0, engine: 'none', status: 'empty', message: '高速OCRは未対応です。Tesseract.jsで読み取ります。' };

  try {
    const bitmap = await createImageBitmap(file);
    const results = await new Detector().detect(bitmap);
    bitmap.close?.();
    const text = normalizeOcrText(results.map((result) => result.rawValue).filter(Boolean).join('\n'));
    return {
      text,
      confidence: text ? 0.72 : 0,
      engine: 'textDetector',
      status: text ? 'success' : 'empty',
      message: text ? '高速OCRで文字を読み取りました。' : '高速OCRでは文字を読み取れませんでした。'
    };
  } catch {
    return { text: '', confidence: 0, engine: 'none', status: 'empty', message: '高速OCRに失敗しました。Tesseract.jsで読み取ります。' };
  }
}

async function readWithTesseractVariants(
  file: File | Blob,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void }
): Promise<OcrResult> {
  const started = performance.now();
  throwIfAborted(options.signal);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('jpn+eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') options.onProgress?.(Math.round(message.progress * 100));
    }
  });

  const abort = () => {
    void worker.terminate();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    let best: { text: string; confidence: number; kind: OcrVariantKind; score: number } | undefined;
    const usedKinds: OcrVariantKind[] = [];

    await worker.setParameters({ tessedit_pageseg_mode: '11' as never, preserve_interword_spaces: '1' });
    const fastResult = await worker.recognize(file);
    const fastText = normalizeOcrText(fastResult.data.text.trim());
    const fastConfidence = Math.max(0, Math.min(1, (fastResult.data.confidence ?? 0) / 100));
    const fastCandidateCount = buildCandidates(fastText).length;
    best = {
      text: fastText,
      confidence: fastConfidence,
      kind: 'original',
      score: scoreOcrVariant({ text: fastText, confidence: fastConfidence, candidateCount: fastCandidateCount, variantKind: 'original' })
    };
    usedKinds.push('original');
    options.onProgress?.(25);

    if (fastCandidateCount > 0 && fastConfidence >= 0.72 && fastText.replace(/\s/g, '').length >= 6) {
      return {
        text: fastText,
        confidence: fastConfidence,
        engine: 'tesseract',
        status: 'success',
        message: '簡易OCRで十分な候補を取得したため、追加前処理を省略しました。',
        preprocessing: usedKinds,
        processingTimeMs: performance.now() - started
      };
    }

    const variants = await createOcrVariants(file).catch(() => [{ kind: 'original' as OcrVariantKind, label: '元画像', blob: file }]);
    const fallbackVariants = variants.filter((variant) => variant.kind !== 'original').slice(0, 4);

    for (const [index, variant] of fallbackVariants.entries()) {
      throwIfAborted(options.signal);
      await worker.setParameters({
        tessedit_pageseg_mode: (variant.kind === 'centerCrop' ? '6' : '11') as never,
        preserve_interword_spaces: '1'
      });
      const result = await worker.recognize(variant.blob);
      const text = normalizeOcrText(result.data.text.trim());
      const confidence = Math.max(0, Math.min(1, (result.data.confidence ?? 0) / 100));
      const candidateCount = buildCandidates(text).length;
      const score = scoreOcrVariant({ text, confidence, candidateCount, variantKind: variant.kind });
      if (!best || score > best.score) best = { text, confidence, kind: variant.kind, score };
      usedKinds.push(variant.kind);
      options.onProgress?.(25 + Math.round(((index + 1) / Math.max(1, fallbackVariants.length)) * 75));
    }

    return {
      text: best?.text ?? '',
      confidence: best?.confidence ?? 0,
      engine: 'tesseract',
      status: best?.text ? 'success' : 'empty',
      message: best?.text ? `Tesseract.jsで文字を読み取りました。採用前処理: ${best.kind}` : '文字を読み取れませんでした。銘柄は手入力してください。',
      preprocessing: usedKinds,
      processingTimeMs: performance.now() - started
    };
  } finally {
    options.signal?.removeEventListener('abort', abort);
    await worker.terminate().catch(() => undefined);
  }
}

export function buildCandidates(ocrText?: string, ocrConfidence = 0): CandidateMatch[] {
  const raw = ocrText ?? '';
  const correctedRaw = correctOcrConfusions(raw);
  const text = normalizeForMatch(correctedRaw);
  if (!text) return [];

  const volume = extractNumber(correctedRaw, /(\d{3,4})\s?m[lL]/);
  const abv = extractNumber(correctedRaw, /(?:alc|alcohol|アルコール|度数)[^\d]*(\d{1,2}(?:\.\d)?)/i);
  const candidates: CandidateMatch[] = [];

  for (const candidate of alcoholLabelCandidates) {
    const matchedAlias = candidate.aliases.find((alias) => isLikelyMatch(text, normalizeForMatch(alias)));
    const makerMatched = candidate.makerName ? text.includes(normalizeForMatch(candidate.makerName)) : false;
    if (!matchedAlias && !makerMatched) continue;

    const aliasExact = matchedAlias ? text.includes(normalizeForMatch(matchedAlias)) : false;
    const matchReasons = [
      matchedAlias ? (aliasExact ? '銘柄名一致' : 'OCR誤認識補正') : undefined,
      makerMatched ? '蔵元名一致' : undefined,
      volume ? '容量候補を抽出' : undefined,
      abv ? 'アルコール度数候補を抽出' : undefined
    ].filter(Boolean) as string[];

    const productMatch = matchedAlias ? (aliasExact ? 100 : 78) : 55;
    const scores = scoreCandidate({
      ocrConfidence,
      productMatch,
      makerMatch: makerMatched ? 100 : 0,
      alcoholTypeMatch: matchedAlias ? 85 : 0,
      volumeMatch: volume ? 70 : 0
    });
    candidates.push({
      productName: candidate.productName,
      makerName: candidate.makerName,
      alcoholType: candidate.alcoholType,
      volume,
      abv,
      confidence: matchedAlias && makerMatched ? 'high' : 'medium',
      matchReasons,
      mismatchReasons: [!makerMatched && candidate.makerName ? '蔵元名がOCR文字列と一致しません' : undefined].filter(Boolean) as string[],
      ...scores
    });
  }

  return candidates.sort((a, b) => (b.totalConfidence ?? 0) - (a.totalConfidence ?? 0)).slice(0, 6);
}

function mergeCandidates(primary: CandidateMatch[], secondary: CandidateMatch[]) {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((candidate) => {
    const key = `${candidate.productName ?? ''}|${candidate.makerName ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

async function normalizeImageFile(file: File): Promise<{ file: File; warning?: string }> {
  const lower = file.name.toLowerCase();
  const isHeic = lower.endsWith('.heic') || lower.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return { file };

  try {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return {
      file: new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified }),
      warning: 'HEIC/HEIFをブラウザ内でJPEGへ変換しました。撮影日が読めない場合は手動で設定してください。'
    };
  } catch {
    throw new Error('HEIC/HEIFの変換に失敗しました。iPhoneの写真設定で「互換性優先」にするか、JPEGへ変換してから選択してください。');
  }
}

export function revokeDraftPreview(draft?: Pick<ImportedPhotoDraft, 'previewUrl'>) {
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
}

export function imageTypeLabel(type: ImageType) {
  return {
    frontLabel: '表ラベル',
    backLabel: '裏ラベル',
    bottle: 'ボトル全体',
    glass: 'グラス',
    food: '料理',
    receipt: 'レシート',
    other: 'その他'
  }[type];
}

function assertSupportedImage(file: File) {
  const lower = file.name.toLowerCase();
  const supported =
    file.type.startsWith('image/') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif');
  if (!supported) throw new Error('この画像形式ではOCR精度が低下する、または読み込めない可能性があります。画像ファイルを選択してください。');
}

async function hashFile(file: File | Blob) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readImageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}

function normalizeExifDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function normalizeOcrText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[|｜]/g, 'ー')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function correctOcrConfusions(value: string) {
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

function normalizeForMatch(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\\\s・.,/／|｜:：;；'"“”‘’()[\]{}<>＜＞【】「」『』]/g, '');
}

function isLikelyMatch(text: string, alias: string) {
  if (!alias) return false;
  if (text.includes(alias)) return true;
  return ngramSimilarity(text, alias) >= 0.62 || levenshteinSimilarity(text, alias) >= 0.72;
}

function ngramSimilarity(a: string, b: string, n = 2) {
  const gramsA = ngrams(a, n);
  const gramsB = ngrams(b, n);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  const intersection = [...gramsA].filter((gram) => gramsB.has(gram)).length;
  return (2 * intersection) / (gramsA.size + gramsB.size);
}

function ngrams(value: string, n: number) {
  const result = new Set<string>();
  for (let index = 0; index <= value.length - n; index += 1) result.add(value.slice(index, index + n));
  if (result.size === 0 && value) result.add(value);
  return result;
}

function levenshteinSimilarity(a: string, b: string) {
  const window = a.length > b.length ? a.slice(0, Math.max(b.length + 2, 8)) : a;
  const distance = levenshtein(window, b);
  return 1 - distance / Math.max(window.length, b.length, 1);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
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

function extractNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('処理をキャンセルしました。');
}
