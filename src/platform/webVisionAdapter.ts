import type {
  AnalyzeImageOptions,
  DetectedLabelRegions,
  ImageFileOptions,
  ImageSimilarityResult,
  NativeBarcodeResult,
  NativeImageAnalysis,
  NativeImageEmbedding,
  NativeOcrOptions,
  NativeOcrResult,
  NativeVisionCapabilities,
  SakeVisionPlugin
} from './visionTypes';

function unsupportedFileUri(uri: string) {
  if (!uri.startsWith('blob:') && !uri.startsWith('data:')) {
    throw new Error('Web版の画像解析には、この画面で選択した画像が必要です。');
  }
}

export const webVisionAdapter: SakeVisionPlugin = {
  async analyzeImage(options: AnalyzeImageOptions): Promise<NativeImageAnalysis> {
    unsupportedFileUri(options.localFileUri);
    const blob = await (await fetch(options.localFileUri)).blob();
    const [{ readImageText }, { readProductBarcodes }, { detectLabelRegionsFromImage }, { analyzePhotoQuality }, { createVisualFingerprint }] = await Promise.all([
      import('../services/photoImport'),
      import('../services/barcodeService'),
      import('../services/labelRegionService'),
      import('../services/imageQualityService'),
      import('../services/visualFeatureService')
    ]);
    const quality = await analyzePhotoQuality(blob);
    const [ocr, barcode, regions, fingerprint] = await Promise.all([
      readImageText(blob),
      readProductBarcodes(blob),
      detectLabelRegionsFromImage(blob, quality),
      createVisualFingerprint(blob)
    ]);
    return {
      textObservations: ocr.text ? [{
        text: ocr.text, confidence: ocr.confidence,
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
        regionType: 'fullImage', engine: ocr.engine === 'textDetector' ? 'text-detector' : 'tesseract', passId: 'web-full'
      }] : [],
      barcodeObservations: barcode.values.map((rawValue) => ({ rawValue, format: 'unknown', confidence: 0.8 })),
      labelRegions: regions.map((region) => ({
        id: region.id, boundingBox: { x: region.x, y: region.y, width: region.width, height: region.height },
        confidence: region.confidence, regionType: region.kind === 'neck' ? 'neckLabel' : region.kind === 'back' ? 'backLabel' : region.kind === 'barcode' ? 'barcode' : 'frontLabel'
      })),
      visualEmbedding: { values: [...fingerprint.luminance, ...fingerprint.colorHistogram], model: 'sake-local-fingerprint-v1', dimensions: fingerprint.luminance.length + fingerprint.colorHistogram.length },
      imageQuality: { blurScore: quality.blurScore, brightnessScore: quality.brightnessScore, glareScore: quality.glareScore, labelCoverage: quality.labelCoverage ?? 0, warnings: quality.warnings },
      processingTimeMs: ocr.processingTimeMs ?? 0,
      warnings: quality.warnings
    };
  },
  async detectLabelRegions(options: ImageFileOptions): Promise<DetectedLabelRegions> {
    const result = await this.analyzeImage!(options);
    return { regions: result.labelRegions, processingTimeMs: result.processingTimeMs };
  },
  async recognizeText(options: NativeOcrOptions): Promise<NativeOcrResult> {
    const result = await this.analyzeImage!(options);
    return { observations: result.textObservations, processingTimeMs: result.processingTimeMs, engine: result.textObservations[0]?.engine ?? 'tesseract' };
  },
  async readBarcodes(options: ImageFileOptions): Promise<NativeBarcodeResult> {
    const result = await this.analyzeImage!(options);
    return { observations: result.barcodeObservations, processingTimeMs: result.processingTimeMs };
  },
  async createImageEmbedding(options: ImageFileOptions): Promise<NativeImageEmbedding> {
    const result = await this.analyzeImage!(options);
    return result.visualEmbedding ?? { values: [], model: 'sake-local-fingerprint-v1', dimensions: 0 };
  },
  async compareImages(): Promise<ImageSimilarityResult> {
    throw new Error('Web版では保存済み特徴量を使って比較します。');
  },
  async getCapabilities(): Promise<NativeVisionCapabilities> {
    return {
      environment: 'pwa', platform: navigator.platform, ocrEngine: 'tesseract',
      barcodeEngine: 'BarcodeDetector / ZXing', visualEngine: 'sake-local-fingerprint-v1', modelVersion: 'web-v1',
      supportsLabelDetection: true, supportsTextRecognition: true, supportsBarcode: true, supportsVisualEmbedding: true
    };
  },
  async cancel() { return; }
};
