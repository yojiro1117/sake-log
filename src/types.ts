export type AlcoholType = 'sake' | 'wine' | 'shochu' | 'beer';

export type ImageType = 'frontLabel' | 'backLabel' | 'bottle' | 'other';
export type BackgroundMode = 'original' | 'cutout' | 'template' | 'solid' | 'blur';
export type CostPerformance = 'S' | 'A' | 'B' | 'C';
export type Confidence = 'high' | 'medium' | 'low' | 'manual';

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

export interface MarketPriceCandidate {
  id: string;
  itemName: string;
  shopName: string;
  itemPrice: number;
  itemUrl: string;
  source: 'rakuten' | 'history' | 'manual';
  fetchedAt: string;
  confidence: Confidence;
}

export interface SakeImage {
  imageId: string;
  logId?: string;
  imageType: ImageType;
  originalBlob: Blob;
  processedBlob?: Blob;
  backgroundMode: BackgroundMode;
  ocrText?: string;
  createdAt: string;
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
  drankAt: string;
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
  generatedTexts: GeneratedTexts;
  memo?: string;
  tags: string[];
  sourceInfo?: string;
  userConfirmed: boolean;
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
