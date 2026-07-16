export type AlcoholType =
  | 'sake'
  | 'shochu'
  | 'beer'
  | 'whisky'
  | 'wine'
  | 'gin'
  | 'vodka'
  | 'rum'
  | 'tequila'
  | 'liqueur'
  | 'other';

export type ImageType = 'frontLabel' | 'backLabel' | 'bottle' | 'glass' | 'food' | 'receipt' | 'other';
export type BackgroundMode = 'original' | 'cutout' | 'template' | 'solid' | 'blur';
export type CostPerformance = 'S' | 'A' | 'B' | 'C' | 'D';
export type Confidence = 'high' | 'medium' | 'low' | 'manual' | 'unknown';
export type ImportMode = 'singleLog' | 'separateLogs';
export type ImportStatus = 'pending' | 'processing' | 'success' | 'warning' | 'failed' | 'cancelled';
export type LogStatus = 'complete' | 'incomplete' | 'needs_review';
export type DraftStatus = 'editing' | 'paused' | 'ready';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type IdentificationPhotoType = ImageType | 'neckLabel' | 'cap' | 'barcode' | 'shelf' | 'multipleBottles' | 'unknown';
export type IdentificationPath = 'fast' | 'standard' | 'deep';

export interface RatingAxis {
  key: string;
  label: string;
  question: string;
}

export interface AlcoholProfile {
  type: AlcoholType;
  label: string;
  axes: RatingAxis[];
}

export interface AlcoholLabelCandidate {
  productName: string;
  makerName?: string;
  alcoholType: AlcoholType;
  aliases: string[];
}

export type CatalogSource = 'built-in' | 'user-confirmed' | 'rakuten-confirmed' | 'imported';

export interface AlcoholProductCatalogEntry {
  productId: string;
  brandFamily: string;
  canonicalProductName: string;
  variantName?: string;
  makerName: string;
  alcoholType: AlcoholType;
  aliases: string[];
  kanaAliases: string[];
  latinAliases: string[];
  commonOcrErrors: string[];
  volumesMl: number[];
  abvMin?: number;
  abvMax?: number;
  janCodes: string[];
  keywords: string[];
  exclusionKeywords: string[];
  referenceImageIds: string[];
  source: CatalogSource;
  userConfirmed: boolean;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateEvidence {
  kind: 'jan' | 'exact' | 'alias' | 'maker' | 'type' | 'volume' | 'abv' | 'ocr-repeat' | 'multi-photo' | 'visual' | 'layout' | 'history' | 'fuzzy';
  score: number;
  detail: string;
  sourceImageId?: string;
  sourceRegionId?: string;
  confidence?: number;
  rawValue?: string | number;
  normalizedValue?: string | number;
  method?: IdentificationEvidence['method'];
  sourcePhotoType?: IdentificationPhotoType;
  preprocessing?: string;
  engine?: OcrResult['engine'] | 'catalog' | 'history';
  boundingBox?: { x: number; y: number; width: number; height: number };
  conflict?: string;
}

export type CandidateSource = 'text' | 'barcode' | 'visual' | 'history' | 'correction' | 'multi-photo';

export interface CandidateRetrievalSummary {
  textCandidates: string[];
  barcodeCandidates: string[];
  visualCandidates: string[];
  historyCandidates: string[];
  correctionCandidates: string[];
  multiPhotoCandidates: string[];
}

export interface PhotoQualityAnalysis {
  blurScore: number;
  brightnessScore: number;
  contrastScore: number;
  glareScore: number;
  skewAngle?: number;
  labelCoverage?: number;
  textSizeEstimate?: number;
  width: number;
  height: number;
  warnings: string[];
  recommendedActions: string[];
  qualityLevel?: 'good' | 'fair' | 'poor';
  whiteClipRatio?: number;
  blackClipRatio?: number;
  compressionScore?: number;
  estimatedTextSize?: number;
}

export interface LabelRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  kind: 'front' | 'back' | 'neck' | 'barcode' | 'manual' | 'center';
  reasons: string[];
}

export interface VisualFingerprint {
  hash: string;
  averageHash?: string;
  perceptualHash?: string;
  luminance: number[];
  colorHistogram: number[];
  edgeHistogram?: number[];
  dominantColors?: string[];
  layoutSignature?: number[];
  aspectRatio: number;
}

export interface ProductReferenceImage {
  id: string;
  productId: string;
  imageHash: string;
  fingerprint: VisualFingerprint;
  sourceImageId?: string;
  photoType?: IdentificationPhotoType;
  qualityLevel?: PhotoQualityAnalysis['qualityLevel'];
  userConfirmed: boolean;
  createdAt: string;
}

export interface IdentificationRun {
  id: string;
  imageIds: string[];
  ocrText: string;
  barcodeValues: string[];
  candidateProductIds: string[];
  topConfidence?: number;
  abstained: boolean;
  processingTimeMs: number;
  createdAt: string;
  path?: IdentificationPath;
  status?: 'running' | 'completed' | 'cancelled' | 'failed';
  photoTypes?: IdentificationPhotoType[];
  warnings?: string[];
  errors?: string[];
}

export interface IdentificationEvidence {
  id: string;
  runId: string;
  field: 'brand' | 'product' | 'variant' | 'maker' | 'volume' | 'abv' | 'barcode' | 'price' | 'visual';
  value: string | number;
  sourceImageId: string;
  sourceRegionId?: string;
  method: 'ocr' | 'barcode' | 'visual' | 'receipt' | 'history';
  confidence: number;
  createdAt: string;
}

export interface IdentificationResult {
  runId: string;
  candidates: CandidateMatch[];
  evidences: IdentificationEvidence[];
  abstained: boolean;
  path: IdentificationPath;
  firstCandidateMs?: number;
  processingTimeMs: number;
  warnings: string[];
  errors: string[];
  retrieval?: CandidateRetrievalSummary;
  stageTimings?: Record<string, number>;
}

export interface PerspectivePoint { x:number; y:number }
export interface PerspectiveQuad {
  nw:PerspectivePoint;
  ne:PerspectivePoint;
  se:PerspectivePoint;
  sw:PerspectivePoint;
}

export interface ProductAliasEntry {
  id: string;
  productId: string;
  alias: string;
  kind: 'canonical' | 'kana' | 'latin' | 'ocr-error' | 'user-confirmed';
  confirmed: boolean;
  updatedAt: string;
}

export interface ProductBarcodeEntry {
  id: string;
  productId: string;
  codeType: string;
  rawValue: string;
  confirmed: boolean;
  updatedAt: string;
}

export interface StoredVisualFeature {
  id: string;
  productId?: string;
  imageHash: string;
  fingerprint: VisualFingerprint;
  userConfirmed: boolean;
  createdAt: string;
}

export interface IdentificationSettings {
  id: 'default';
  deepAnalysisEnabled: boolean;
  localOnly: true;
  maxReferenceImages: number;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  updatedAt: string;
}

export interface IdentificationLearningEvent {
  id: string;
  runId: string;
  proposedProductId?: string;
  confirmedProductId?: string;
  action: LearningDecision;
  finalProductName?: string;
  finalMakerName?: string;
  createdAt: string;
}

export type LearningDecision = 'accepted' | 'corrected' | 'rejected' | 'manual-new';

export interface CandidateMatch {
  productId?: string;
  brandFamily?: string;
  variantName?: string;
  productName?: string;
  makerName?: string;
  alcoholType?: AlcoholType;
  volume?: number;
  abv?: number;
  confidence: Confidence;
  matchReasons: string[];
  warning?: string;
  ocrConfidence?: number;
  productConfidence?: number;
  makerConfidence?: number;
  alcoholTypeConfidence?: number;
  volumeConfidence?: number;
  totalConfidence?: number;
  mismatchReasons?: string[];
  requiresConfirmation?: boolean;
  rank?: number;
  calibratedConfidence?: number;
  evidences?: CandidateEvidence[];
  barcode?: string;
  visualSimilarity?: number;
}

export interface PhotoClassification {
  type: ImageType;
  confidence: number;
  reasons: string[];
  alternatives: Array<{ type: ImageType; confidence: number }>;
  requiresConfirmation: boolean;
}

export interface VisualImageFeatures {
  centerEdgeDensity: number;
  outerEdgeDensity: number;
  edgeSpread: number;
}

export interface MarketPriceCandidate {
  id: string;
  logId?: string;
  source: 'rakuten' | 'history' | 'manual';
  itemName: string;
  shopName?: string;
  itemUrl?: string;
  price: number;
  shippingFee?: number;
  shippingIncluded?: boolean;
  totalPrice?: number;
  volumeMl?: number;
  quantity?: number;
  unitPricePerBottle?: number;
  unitPricePer100ml?: number;
  fetchedAt: string;
  matchScore: number;
  matchReasons: string[];
  excludedReasons: string[];
  recommended: boolean;
}

export interface SelectedMarketPriceSnapshot {
  candidateId: string | null;
  adoptedMarketPrice?: number;
  itemName?: string;
  shopName?: string;
  itemUrl?: string;
  source: MarketPriceCandidate['source'] | 'unfetched';
  fetchedAt?: string;
  volumeMl?: number;
  quantity?: number;
  shippingFee?: number;
  shippingIncluded?: boolean;
  totalPrice?: number;
  priceConfidence: Confidence;
  matchReasons: string[];
}

export interface SakeImage {
  imageId: string;
  logId?: string;
  imageType: ImageType;
  originalBlob: Blob;
  processedBlob?: Blob;
  backgroundMode: BackgroundMode;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  capturedAt?: string;
  imageHash?: string;
  ocrText?: string;
  ocrConfidence?: number;
  createdFromImport?: boolean;
  sortOrder?: number;
  createdAt: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
  engine: 'textDetector' | 'tesseract' | 'apple-vision' | 'mlkit' | 'none';
  status: 'success' | 'empty' | 'failed' | 'cancelled';
  message: string;
  preprocessing?: string[];
  processingTimeMs?: number;
}

export interface ImportedPhotoDraft {
  id: string;
  fileName: string;
  originalFile: File;
  resizedBlob: Blob;
  previewUrl: string;
  capturedAt?: string;
  imageHash: string;
  width?: number;
  height?: number;
  ocr: OcrResult;
  candidates: CandidateMatch[];
  status: ImportStatus;
  message?: string;
  imageType: ImageType;
  classification?: PhotoClassification;
  sortOrder: number;
  fileKey?: string;
  classificationConfirmed?: boolean;
  processing?: PhotoProcessingMetrics;
  quality?: PhotoQualityAnalysis;
  labelRegions?: LabelRegion[];
  barcodeValues?: string[];
  visualFingerprint?: VisualFingerprint;
  identificationRunId?: string;
  identificationPath?: IdentificationPath;
  identificationPhotoType?: IdentificationPhotoType;
  identificationPhotoTypeConfidence?: number;
}

export interface PersistedImportedPhoto {
  id: string;
  fileName: string;
  originalFile: File;
  resizedBlob: Blob;
  capturedAt?: string;
  imageHash: string;
  width?: number;
  height?: number;
  ocr: OcrResult;
  candidates: CandidateMatch[];
  status: ImportStatus;
  message?: string;
  imageType: ImageType;
  classification?: PhotoClassification;
  sortOrder: number;
  fileKey?: string;
  classificationConfirmed?: boolean;
  processing?: PhotoProcessingMetrics;
}

export interface PhotoProcessingMetrics {
  startedAt: string;
  previewReadyMs?: number;
  heicConversionMs?: number;
  exifMs?: number;
  resizeMs?: number;
  ocrMs?: number;
  candidateMs?: number;
  classificationMs?: number;
  totalMs?: number;
  ocrInputPixels?: number;
  preprocessingVariants?: number;
  originalBytes: number;
  processedBytes?: number;
}

export interface SakeLogDraft {
  id: string;
  source: 'manual' | 'photo-import';
  importMode?: ImportMode;
  formState: Record<string, unknown>;
  photos: PersistedImportedPhoto[];
  activeImageIndex?: number;
  queueState?: { total: number; processed: number; failed: number };
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  status: DraftStatus;
  schemaVersion: number;
  revision?: number;
}

export interface OcrCorrectionEntry {
  id: string;
  observedText: string;
  correctedProductName: string;
  correctedMakerName?: string;
  correctedAlcoholType?: AlcoholType;
  aliases: string[];
  occurrenceCount: number;
  acceptedCount: number;
  rejectedCount: number;
  lastUsedAt: string;
  createdAt: string;
  confidenceAdjustment: number;
  learningEventIds?: string[];
}

export interface LabelAliasEntry {
  id: string;
  productName: string;
  alias: string;
  createdAt: string;
}

export interface ClassificationCorrection {
  id: string;
  fingerprint: string;
  suggestedType: ImageType;
  correctedType: ImageType;
  acceptedCount: number;
  rejectedCount: number;
  updatedAt: string;
  learningEventIds?: string[];
}

export interface GeneratedTexts {
  sns: string;
  oneLine: string;
  hashtags: string[];
}

export interface SakeLog {
  logId: string;
  createdAt: string;
  updatedAt: string;
  drankAt?: string;
  capturedAt?: string;
  importMode?: ImportMode;
  selectedMarketPriceCandidateId?: string | null;
  selectedMarketPriceSnapshot?: SelectedMarketPriceSnapshot;
  alcoholType: AlcoholType;
  productName: string;
  makerName?: string;
  region?: string;
  country?: string;
  prefecture?: string;
  volume?: number;
  abv?: number;
  ingredients?: string;
  ricePolishingRatio?: string;
  sakeMeterValue?: string;
  acidity?: string;
  grapeVariety?: string;
  shochuMaterial?: string;
  beerStyle?: string;
  purchasePrice?: number;
  marketPriceMin?: number;
  marketPriceMedian?: number;
  marketPriceAverage?: number;
  adoptedMarketPrice?: number;
  marketPriceSource?: string;
  marketPriceFetchedAt?: string;
  marketPriceCandidates?: MarketPriceCandidate[];
  valueScore?: CostPerformance;
  priceConfidence?: Confidence;
  priceMemo?: string;
  placeType?: string;
  shopName?: string;
  servingStyle?: string;
  glassType?: string;
  foodPairing?: string;
  baseScores: Record<string, number>;
  satisfactionScore: number;
  repeatScore: number;
  foodMatchScore: number;
  correctedScore: number;
  correctionReason: string;
  radarImagePath?: string;
  postImagePath?: string;
  generatedTexts?: GeneratedTexts;
  memo?: string;
  tags: string[];
  sourceInfo?: string;
  userConfirmed: boolean;
  status?: LogStatus;
  saveOperationId?: string;
}

export interface DeviceValidationResult {
  id: 'default';
  updatedAt: string;
  results: Record<string, 'success' | 'failed' | 'untested'>;
  notes: Record<string, string>;
}

export interface ToneSettings {
  voice: 'polite' | 'natural' | 'casual' | 'expert';
  ending: 'desu' | 'dearu' | 'spoken';
  length: 'short' | 'standard' | 'detailed';
  energy: 'calm' | 'standard' | 'bright';
  terminology: 'low' | 'standard' | 'high';
  emoji: 'none' | 'few' | 'many';
  hashtag: 'none' | 'few' | 'standard' | 'many';
  strictness: 'soft' | 'standard' | 'strict';
  purpose: 'record' | 'intro' | 'recommend' | 'visual';
}

export interface UserSettings {
  id: 'default';
  ageConfirmed: boolean;
  personalityProfile?: Record<string, number>;
  reviewProfile?: {
    mainType: string;
    subType: string;
  };
  toneSettings: ToneSettings;
  defaultTemplate?: string;
  rakutenApplicationId?: string;
  backupSettings: {
    localExportedAt?: string;
    googleDriveReady: boolean;
  };
  privacySettings: {
    keepImagesLocal: boolean;
  };
}

export interface PostTemplate {
  templateId: string;
  templateName: string;
  targetSns: string;
  body: string;
  tone: ToneSettings['voice'];
  hashtagMode: ToneSettings['hashtag'];
  createdAt: string;
  updatedAt: string;
}

export interface BackupStatus {
  id: 'default';
  lastLocalExportAt?: string;
  googleDriveStatus: 'notConfigured' | 'readyForFuture' | 'error';
  message: string;
}
