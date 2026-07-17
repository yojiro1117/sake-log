import { fileToResizedBlob } from './imageService';
import { createOcrVariants, scoreOcrVariant, type OcrVariantKind } from './imagePreprocessingService';
import { classifyIdentificationPhoto, classifyPhoto, extractVisualImageFeatures } from './photoClassificationService';
import { db } from '../db/db';
import type { CandidateMatch, ImageType, ImportedPhotoDraft, OcrResult, PerspectiveQuad } from '../types';
import { OcrWorkerSession } from './ocrWorkerSession';
import { analyzePhotoQuality } from './imageQualityService';
import { cropPerspectiveQuad, cropRegion, detectLabelRegionsFromImage } from './labelRegionService';
import { createVisualFingerprint } from './visualFeatureService';
import { readProductBarcodes } from './barcodeService';
import { builtInAlcoholProductCatalog } from '../data/alcoholProductCatalog';
import { rankCatalogCandidates } from './candidateRanking';
import { retrieveCatalogCandidates } from './candidateRetrieval';
import { identifyAlcoholProductPipeline } from './productIdentificationPipeline';
import type { SmartCaptureResult } from './smartCaptureService';
import { aggregateNativeText } from './nativeOcrAggregation';
import { extractStructuredFields } from './ocrNormalization';

type DetectedText = { rawValue?: string };
type TextDetectorCtor = new () => { detect: (source: ImageBitmapSource) => Promise<DetectedText[]> };

export const MAX_IMPORT_FILES = 10;

export async function createNativeCapturedPhotoDraft(capture: SmartCaptureResult): Promise<ImportedPhotoDraft> {
  const started = performance.now();
  const sourceBlob = await (await fetch(capture.webPath)).blob();
  const file = new File([sourceBlob], `sake-capture-${Date.now()}.jpg`, { type: sourceBlob.type || 'image/jpeg', lastModified: Date.now() });
  const resizedBlob = await fileToResizedBlob(file, 1400, 0.86);
  const [imageHash, size, fullFingerprint] = await Promise.all([hashFile(file), readImageSize(resizedBlob), createVisualFingerprint(resizedBlob)]);
  const imageId = crypto.randomUUID();
  const aggregated = aggregateNativeText(capture.analysis.textObservations);
  const nativeRegions = capture.analysis.labelRegions.map((region) => ({
    id: region.id,
    x: region.boundingBox.x,
    y: region.boundingBox.y,
    width: region.boundingBox.width,
    height: region.boundingBox.height,
    confidence: region.confidence,
    kind: region.regionType === 'backLabel' ? 'back' as const : region.regionType === 'neckLabel' ? 'neck' as const : region.regionType === 'barcode' ? 'barcode' as const : 'front' as const,
    reasons: ['ネイティブラベル検出'],
    quad: region.cornerPoints?.length === 4 ? {
      nw: { x:region.cornerPoints[0].x, y:1 - region.cornerPoints[0].y },
      ne: { x:region.cornerPoints[1].x, y:1 - region.cornerPoints[1].y },
      se: { x:region.cornerPoints[2].x, y:1 - region.cornerPoints[2].y },
      sw: { x:region.cornerPoints[3].x, y:1 - region.cornerPoints[3].y }
    } : undefined,
    areaRatio: region.boundingBox.width * region.boundingBox.height,
    detectionMethod: 'native-vision'
  }));
  const strongestRegion = [...nativeRegions].filter((region) => region.kind !== 'barcode').sort((left, right) => right.confidence - left.confidence)[0];
  const labelCropBlob = strongestRegion
    ? await (strongestRegion.quad ? cropPerspectiveQuad(resizedBlob, strongestRegion.quad) : cropRegion(resizedBlob, strongestRegion)).catch(() => resizedBlob)
    : resizedBlob;
  const labelFingerprint = await createVisualFingerprint(labelCropBlob);
  const identification = await identifyAlcoholProductPipeline({ images: [{
    imageId,
    localFileUri: capture.localFileUri,
    photoType: capture.photoType,
    classificationConfidence: 1,
    textObservations: capture.analysis.textObservations,
    barcodeObservations: capture.analysis.barcodeObservations,
    labelRegions: capture.analysis.labelRegions,
    visualEmbedding: capture.analysis.visualEmbedding?.values,
    localFingerprint: labelFingerprint,
    imageHash,
    imageQuality: capture.analysis.imageQuality
  }] });
  await db.nativeAnalyses.put({
    id: identification.runId,
    imageId,
    environment: capture.analysis.textObservations[0]?.engine === 'apple-vision' ? 'ios-native' : 'android-native',
    engine: capture.analysis.textObservations[0]?.engine ?? 'native',
    payload: {
      textObservations: capture.analysis.textObservations,
      barcodeObservations: capture.analysis.barcodeObservations,
      labelRegions: capture.analysis.labelRegions,
      processingTimeMs: capture.analysis.processingTimeMs,
      warnings: capture.analysis.warnings
    },
    createdAt: new Date().toISOString()
  });
  if (identification.abstained || identification.candidates.length === 0) {
    await db.unknownProductDrafts.put({
      id: crypto.randomUUID(),
      extractedTexts: aggregated.text ? aggregated.text.split(/\r?\n/u) : [],
      sourceImageIds: [imageId],
      status: 'catalog-unregistered',
      createdAt: new Date().toISOString()
    });
  }
  const imageType: ImageType = capture.photoType === 'backLabel' ? 'backLabel' : capture.photoType === 'bottle' ? 'bottle' : 'frontLabel';
  return {
    id: imageId,
    fileName: file.name,
    originalFile: file,
    resizedBlob,
    previewUrl: URL.createObjectURL(resizedBlob),
    capturedAt: new Date().toISOString(),
    imageHash,
    width: size.width,
    height: size.height,
    ocr: {
      text: aggregated.text,
      confidence: aggregated.confidence,
      engine: capture.analysis.textObservations[0]?.engine === 'text-detector' ? 'textDetector' : capture.analysis.textObservations[0]?.engine ?? 'none',
      status: aggregated.text ? 'success' : 'empty',
      message: aggregated.text ? '端末のネイティブ画像認識でラベルを読み取りました。' : '銘柄を特定できませんでした。手入力してください。',
      processingTimeMs: capture.analysis.processingTimeMs
    },
    candidates: identification.candidates,
    status: identification.candidates.length ? 'success' : 'warning',
    message: capture.warnings.join(' ') || '端末内で画像を解析しました。候補は確認してから採用してください。',
    imageType,
    sortOrder: 0,
    fileKey: photoFileKey(file),
    classificationConfirmed: true,
    processing: { startedAt: new Date().toISOString(), totalMs: performance.now() - started, originalBytes: file.size, processedBytes: resizedBlob.size, ocrMs: capture.analysis.processingTimeMs },
    quality: {
      blurScore: capture.analysis.imageQuality.blurScore,
      brightnessScore: capture.analysis.imageQuality.brightnessScore,
      contrastScore: 0.5,
      glareScore: capture.analysis.imageQuality.glareScore,
      labelCoverage: capture.analysis.imageQuality.labelCoverage,
      width: size.width,
      height: size.height,
      warnings: capture.analysis.imageQuality.warnings,
      recommendedActions: capture.warnings
    },
    labelRegions: nativeRegions,
    barcodeValues: capture.analysis.barcodeObservations.map((item) => item.rawValue),
    visualFingerprint: fullFingerprint,
    labelVisualFingerprint: labelFingerprint,
    labelCropBlob,
    labelCropPreviewUrl: URL.createObjectURL(labelCropBlob),
    identificationRunId: identification.runId,
    identificationPath: identification.path,
    identificationPhotoType: capture.photoType,
    identificationPhotoTypeConfidence: 100
  };
}

export interface PhotoImportProgress {
  index: number;
  total: number;
  fileName: string;
  phase: 'metadata' | 'image' | 'quality' | 'region' | 'ocr' | 'barcode' | 'visual' | 'fusion' | 'candidate' | 'done' | 'failed' | 'cancelled';
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
  const ocrSession = new OcrWorkerSession();

  try {
  for (const [index, file] of files.entries()) {
    if (options.signal?.aborted) {
      failures.push({ fileName: file.name, fileKey: photoFileKey(file), reason: '処理をキャンセルしました。' });
      continue;
    }

    try {
      drafts.push(await createImportedPhotoDraft(file, index, files.length, { ...options, ocrSession }));
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
  } finally {
    await ocrSession.terminate();
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
    ocrSession?: OcrWorkerSession;
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
  const resizedBlob = await fileToResizedBlob(displayFile, 1400, 0.84);
  const { width, height } = await readImageSize(resizedBlob);
  const resizeMs = performance.now() - resizeStarted;
  const previewUrl = URL.createObjectURL(resizedBlob);
  options.onProgress?.({ index, total, fileName: file.name, phase: 'quality', message: '写真の品質を確認しています。' });
  const [quality, visualFingerprint, barcode, classificationVisual] = await Promise.all([
    analyzePhotoQuality(resizedBlob),
    createVisualFingerprint(resizedBlob),
    readProductBarcodes(resizedBlob),
    extractVisualImageFeatures(resizedBlob)
  ]);
  const labelRegions = await detectLabelRegionsFromImage(resizedBlob, quality);
  const strongestLabelRegion = [...labelRegions]
    .filter((region) => region.kind !== 'barcode' && region.kind !== 'neck')
    .sort((left, right) => right.confidence - left.confidence)[0];
  const labelCropBlob = strongestLabelRegion
    ? await (strongestLabelRegion.quad ? cropPerspectiveQuad(resizedBlob, strongestLabelRegion.quad) : cropRegion(resizedBlob, strongestLabelRegion)).catch(() => resizedBlob)
    : resizedBlob;
  const labelVisualFingerprint = await createVisualFingerprint(labelCropBlob);
  const preliminaryClassification = classifyPhoto({
    ocrText:'', width, height, knownCandidateCount:0, ocrConfidence:0,
    corrections:await db.classificationCorrections.toArray(), visualFeatures:classificationVisual
  });
  options.onProgress?.({ index, total, fileName: file.name, phase: 'visual', message: 'ラベル画像から確認済み商品を検索しています。' });
  const earlyIdentification = await identifyAlcoholProductPipeline({
    images: [{
      imageId: id,
      imageType: classifyIdentificationPhoto({
        baseType: preliminaryClassification.type,
        baseConfidence: preliminaryClassification.confidence,
        ocrText: '',
        barcodeValues: barcode.values,
        width,
        height,
        visualFeatures: classificationVisual
      }).type,
      ocrText: '',
      ocrConfidence: 0,
      barcodeValues: barcode.values,
      imageHash,
      fingerprint: labelVisualFingerprint
    }],
    persist: false,
    signal: options.signal
  });
  options.onProgress?.({ index, total, fileName: file.name, phase: 'region', message: 'ラベル領域を探しています。' });
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
    candidates: earlyIdentification.candidates,
    status: 'processing',
    message: earlyIdentification.candidates.length
      ? 'ラベル画像またはJANから候補を表示しました。文字解析を続けています。'
      : 'プレビューを表示しました。端末内で候補を検索しています。',
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
    },
    quality,
    labelRegions,
    barcodeValues: barcode.values,
    visualFingerprint,
    labelVisualFingerprint,
    labelCropBlob,
    labelCropPreviewUrl: URL.createObjectURL(labelCropBlob)
  };
  options.onDraftUpdate?.(pendingDraft);

  throwIfAborted(options.signal);
  options.onProgress?.({ index, total, fileName: file.name, phase: 'ocr', message: '文字を読み取り中です。', ocrProgress: 0 });
  const ocrStarted = performance.now();
  const skipHeavyOcr = (preliminaryClassification.type === 'glass' || preliminaryClassification.type === 'food')
    && preliminaryClassification.confidence >= 80;
  const ocr = skipHeavyOcr ? {
    text:'', confidence:0, engine:'none' as const, status:'empty' as const,
    message:'ラベル写真ではない可能性が高いため、重いOCRを省略しました。'
  } : await readImageText(resizedBlob, {
    signal: options.signal,
    session: options.ocrSession,
    quality,
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

  const classificationStarted = performance.now();
  const classification = classifyPhoto({
    ocrText: ocr.text,
    width,
    height,
    knownCandidateCount: 0,
    ocrConfidence: ocr.confidence,
    corrections: await db.classificationCorrections.toArray(),
    visualFeatures: classificationVisual
  });
  const detailedClassification = classifyIdentificationPhoto({
    baseType: classification.type,
    baseConfidence: classification.confidence,
    ocrText: ocr.text,
    barcodeValues: barcode.values,
    width,
    height,
    visualFeatures: classificationVisual
  });
  const classificationMs = performance.now() - classificationStarted;
  options.onProgress?.({ index, total, fileName: file.name, phase: 'fusion', message: '文字・バーコード・ラベル特徴を統合しています。' });
  const candidateStarted = performance.now();
  const identification = await identifyAlcoholProductPipeline({
    images: [{ imageId:id, imageType:detailedClassification.type, ocrText:ocr.text, ocrConfidence:ocr.confidence, barcodeValues:barcode.values, imageHash, fingerprint:labelVisualFingerprint }],
    signal:options.signal
  });
  const candidates = identification.candidates;
  if (identification.abstained || candidates.length === 0) {
    const fields = extractStructuredFields(ocr.text);
    await db.unknownProductDrafts.put({
      id: `unknown:${imageHash}`,
      volumeMl: fields.volumes[0],
      abv: fields.abvs[0],
      janCode: barcode.values[0],
      extractedTexts: ocr.text ? ocr.text.split(/\r?\n/u).filter(Boolean) : [],
      sourceImageIds: [id],
      status: 'catalog-unregistered',
      createdAt: new Date().toISOString()
    });
  }
  const candidateMs = performance.now() - candidateStarted;
  const status = ocr.status === 'success' && candidates.length > 0 ? 'success' : 'warning';
  const message =
    warning ??
    (candidates.length > 0
      ? 'ラベル画像・JAN・文字・履歴を統合した候補です。内容を確認してください。'
      : ocr.text || barcode.values.length
        ? 'ラベル情報を取得しましたが、端末内商品カタログに未登録の可能性があります。'
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
      labelRegions: labelRegions.map((region) => ({
        id:region.id, kind:region.kind, confidence:region.confidence, areaRatio:region.areaRatio,
        detectionMethod:region.detectionMethod, quad:region.quad
      })),
      visualModel: labelVisualFingerprint.embeddingModel,
      visualVersion: labelVisualFingerprint.embeddingVersion,
      topCandidates: candidates.slice(0, 5).map((candidate) => ({
        productId:candidate.productId,
        productName:candidate.productName,
        matchScore:candidate.totalConfidence,
        visualScore:candidate.visualEmbeddingScore,
        exactImageScore:candidate.exactImageScore,
        barcodeScore:candidate.barcodeScore,
        reasons:candidate.matchReasons,
        conflicts:candidate.mismatchReasons ?? []
      })),
      abstained: identification.abstained,
      stageTimings: identification.stageTimings,
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
    },
    quality,
    labelRegions,
    barcodeValues: barcode.values,
    visualFingerprint,
    identificationRunId: identification.runId,
    identificationPath: identification.path,
    identificationPhotoType: detailedClassification.type,
    identificationPhotoTypeConfidence: detailedClassification.confidence
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
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void; session?: OcrWorkerSession; quality?: Awaited<ReturnType<typeof analyzePhotoQuality>>; mode?: 'standard' | 'vertical' | 'latin' } = {}
): Promise<OcrResult> {
  try {
    const quality = options.quality ?? await analyzePhotoQuality(file);
    const regions = await detectLabelRegionsFromImage(file, quality);
    const primaryRegion = regions
      .filter((region) => region.kind === 'center' || region.kind === 'front' || region.kind === 'back')
      .sort((left, right) => right.confidence - left.confidence)[0];
    const primaryInput = primaryRegion ? await cropRegion(file, primaryRegion) : file;
    const detectorResult = await tryTextDetector(primaryInput);
    const croppedResult = await readWithTesseractVariants(primaryInput, { ...options, quality });
    const croppedCandidateCount = buildCandidates(`${detectorResult.text}\n${croppedResult.text}`).length;
    const needsFullImage = croppedCandidateCount === 0 || croppedResult.confidence < 0.62;
    const fullResult = needsFullImage && primaryInput !== file
      ? await readWithTesseractVariants(file, { ...options, quality })
      : undefined;
    return mergeOcrResults([detectorResult, croppedResult, ...(fullResult ? [fullResult] : [])]);
  } catch (error) {
    if (options.signal?.aborted) {
      return { text: '', confidence: 0, engine: 'tesseract', status: 'cancelled', message: 'OCR処理をキャンセルしました。' };
    }
    return {
      text: '',
      confidence: 0,
      engine: 'tesseract',
      status: 'failed',
      message: error instanceof Error ? error.message : '文字を読み取れませんでした。'
    };
  }
}

function mergeOcrResults(results: OcrResult[]): OcrResult {
  const lines = [...new Set(results.flatMap((result) => result.text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)))];
  const best = [...results].sort((left, right) => {
    const candidateDifference = buildCandidates(right.text).length - buildCandidates(left.text).length;
    return candidateDifference || right.confidence - left.confidence;
  })[0];
  return {
    text: lines.join('\n'),
    confidence: best?.confidence ?? 0,
    engine: best?.engine === 'textDetector' && results.some((result) => result.engine === 'tesseract') ? 'tesseract' : best?.engine ?? 'tesseract',
    status: lines.length ? 'success' : 'empty',
    message: lines.length ? 'ラベル領域を優先し、複数のOCR結果を統合しました。' : '文字を読み取れませんでした。銘柄は手入力してください。',
    preprocessing: [...new Set(results.flatMap((result) => result.preprocessing ?? []))],
    processingTimeMs: results.reduce((sum, result) => sum + (result.processingTimeMs ?? 0), 0)
  };
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
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void; session?: OcrWorkerSession; quality?: Awaited<ReturnType<typeof analyzePhotoQuality>>; mode?: 'standard' | 'vertical' | 'latin' }
): Promise<OcrResult> {
  const started = performance.now();
  throwIfAborted(options.signal);
  const specialized = options.mode && options.mode !== 'standard';
  const ownSession = options.session && !specialized ? undefined : new OcrWorkerSession(options.mode === 'vertical' ? 'jpn_vert+jpn+eng' : options.mode === 'latin' ? 'eng' : 'jpn+eng');
  const session = options.session && !specialized ? options.session : ownSession!;
  session.setLogger((message) => {
    if (message.status === 'recognizing text') options.onProgress?.(Math.round(message.progress * 100));
  });
  const worker = await session.getWorker();

  const abort = () => {
    void worker.terminate();
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  try {
    let best: { text: string; confidence: number; kind: OcrVariantKind; score: number } | undefined;
    const usedKinds: OcrVariantKind[] = [];

    await worker.setParameters({ tessedit_pageseg_mode: (options.mode === 'vertical' ? '5' : options.mode === 'latin' ? '6' : '11') as never, preserve_interword_spaces: '1' });
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

    const variants = await createOcrVariants(file, options.quality).catch(() => [{ kind: 'original' as OcrVariantKind, label: '元画像', blob: file }]);
    const fallbackVariants = variants.filter((variant) => variant.kind !== 'original').slice(0, 4);

    for (const [index, variant] of fallbackVariants.entries()) {
      throwIfAborted(options.signal);
      await worker.setParameters({
        tessedit_pageseg_mode: (variant.kind === 'centerCrop' ? '6' : variant.kind === 'rotate90' ? '5' : '11') as never,
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
    if (ownSession) await ownSession.terminate();
  }
}

export function buildCandidates(ocrText?: string, ocrConfidence = 0): CandidateMatch[] {
  const text = ocrText ?? '';
  return rankCatalogCandidates(retrieveCatalogCandidates(text, builtInAlcoholProductCatalog), { text, ocrConfidence });
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

export function revokeDraftPreview(draft?: Pick<ImportedPhotoDraft, 'previewUrl' | 'labelCropPreviewUrl'>) {
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  if (draft?.labelCropPreviewUrl && draft.labelCropPreviewUrl !== draft.previewUrl) URL.revokeObjectURL(draft.labelCropPreviewUrl);
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

export async function reanalyzePhotoDraft(
  draft: ImportedPhotoDraft,
  options: { region?: { x: number; y: number; width: number; height: number }; quad?:PerspectiveQuad; rotateDegrees?: number; mode?: 'standard' | 'vertical' | 'latin' }
) {
  const region = options.region ? { id:'manual', kind:'manual' as const, confidence:1, reasons:['ユーザー指定範囲'], ...options.region } : undefined;
  const input = options.quad
    ? await cropPerspectiveQuad(draft.resizedBlob, options.quad, options.rotateDegrees ?? 0)
    : region ? await cropRegion(draft.resizedBlob, region, options.rotateDegrees ?? 0) : draft.resizedBlob;
  const quality = await analyzePhotoQuality(input);
  const [ocr, barcode, fingerprint] = await Promise.all([
    readImageText(input, { quality, mode: options.mode }),
    readProductBarcodes(input),
    createVisualFingerprint(input)
  ]);
  const detailedClassification = classifyIdentificationPhoto({
    baseType:draft.imageType,
    baseConfidence:draft.classification?.confidence ?? 50,
    ocrText:ocr.text,
    barcodeValues:barcode.values,
    width:draft.width,
    height:draft.height
  });
  const identification = await identifyAlcoholProductPipeline({
    images: [{ imageId:draft.id, imageType:detailedClassification.type, ocrText:ocr.text, ocrConfidence:ocr.confidence, barcodeValues:barcode.values, imageHash:draft.imageHash, fingerprint }]
  });
  const candidates = identification.candidates;
  return {
    ...draft,
    ocr,
    candidates,
    quality,
    barcodeValues: barcode.values,
    visualFingerprint: draft.visualFingerprint,
    labelVisualFingerprint: fingerprint,
    labelCropBlob: input,
    labelCropPreviewUrl: URL.createObjectURL(input),
    identificationRunId: identification.runId,
    identificationPath: identification.path,
    labelRegions: region ? [region] : await detectLabelRegionsFromImage(input, quality),
    status: candidates.length ? 'success' as const : 'warning' as const,
    message: candidates.length ? `${options.mode ?? 'standard'}設定で再解析しました。候補を確認してください。` : '銘柄を特定できませんでした。範囲や向きを変えるか手入力してください。'
  };
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('処理をキャンセルしました。');
}
