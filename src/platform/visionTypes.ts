import type { AlcoholType, IdentificationPhotoType } from '../types';

export interface NormalizedPoint { x: number; y: number }
export interface NormalizedRect { x: number; y: number; width: number; height: number }

export type VisionEngine = 'apple-vision' | 'mlkit' | 'tesseract' | 'text-detector';
export type NativeRegionType = 'frontLabel' | 'backLabel' | 'neckLabel' | 'barcode' | 'fullImage';

export interface ImageFileOptions { localFileUri: string }
export interface AnalyzeImageOptions extends ImageFileOptions {
  photoType?: IdentificationPhotoType;
  passes?: Array<'label' | 'text' | 'barcode' | 'visual'>;
  signalId?: string;
}
export interface NativeOcrOptions extends ImageFileOptions {
  regions?: NativeLabelRegion[];
  languages?: string[];
  signalId?: string;
}
export interface CompareImageOptions { firstFileUri: string; secondFileUri: string }

export interface NativeTextObservation {
  text: string;
  confidence: number;
  boundingBox: NormalizedRect;
  cornerPoints?: NormalizedPoint[];
  language?: string;
  orientation?: number;
  regionType: NativeRegionType;
  engine: VisionEngine;
  passId: string;
}

export interface NativeBarcodeObservation {
  rawValue: string;
  format: string;
  confidence: number;
  boundingBox?: NormalizedRect;
  sourceImageId?: string;
}

export interface NativeLabelRegion {
  id: string;
  boundingBox: NormalizedRect;
  cornerPoints?: NormalizedPoint[];
  confidence: number;
  regionType: NativeRegionType;
  perspectiveCorrected?: boolean;
}

export interface NativeImageQuality {
  blurScore: number;
  brightnessScore: number;
  glareScore: number;
  labelCoverage: number;
  warnings: string[];
}

export interface NativeImageEmbedding { values: number[]; model: string; dimensions: number }
export interface ImageSimilarityResult { distance: number; similarity: number; model: string }
export interface DetectedLabelRegions { regions: NativeLabelRegion[]; processingTimeMs: number }
export interface NativeOcrResult { observations: NativeTextObservation[]; processingTimeMs: number; engine: VisionEngine }
export interface NativeBarcodeResult { observations: NativeBarcodeObservation[]; processingTimeMs: number }

export interface NativeImageAnalysis {
  textObservations: NativeTextObservation[];
  barcodeObservations: NativeBarcodeObservation[];
  labelRegions: NativeLabelRegion[];
  visualEmbedding?: NativeImageEmbedding;
  imageQuality: NativeImageQuality;
  processingTimeMs: number;
  warnings: string[];
}

export interface NativeVisionCapabilities {
  environment: 'pwa' | 'ios-native' | 'android-native';
  platform: string;
  osVersion?: string;
  deviceModel?: string;
  ocrEngine: VisionEngine;
  barcodeEngine: string;
  visualEngine: string;
  modelVersion: string;
  catalogVersion?: string;
  supportsLabelDetection: boolean;
  supportsTextRecognition: boolean;
  supportsBarcode: boolean;
  supportsVisualEmbedding: boolean;
  thermalState?: string;
  batteryLevel?: number;
}

export interface ProductIdentificationImage {
  imageId: string;
  localFileUri: string;
  photoType: IdentificationPhotoType;
  classificationConfidence: number;
  textObservations: NativeTextObservation[];
  barcodeObservations: NativeBarcodeObservation[];
  labelRegions: NativeLabelRegion[];
  visualEmbedding?: number[];
  imageQuality: NativeImageQuality;
}

export interface ProductIdentificationInput {
  images: ProductIdentificationImage[];
  userHints?: { alcoholType?: AlcoholType; makerName?: string; volumeMl?: number; abv?: number };
}

export interface SakeVisionPlugin {
  analyzeImage(options: AnalyzeImageOptions): Promise<NativeImageAnalysis>;
  detectLabelRegions(options: ImageFileOptions): Promise<DetectedLabelRegions>;
  recognizeText(options: NativeOcrOptions): Promise<NativeOcrResult>;
  readBarcodes(options: ImageFileOptions): Promise<NativeBarcodeResult>;
  createImageEmbedding(options: ImageFileOptions): Promise<NativeImageEmbedding>;
  compareImages(options: CompareImageOptions): Promise<ImageSimilarityResult>;
  getCapabilities(): Promise<NativeVisionCapabilities>;
  cancel(options: { signalId: string }): Promise<void>;
}
