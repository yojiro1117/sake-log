import { alcoholProfiles } from '../data/alcoholProfiles';
import type { AlcoholType, BackgroundMode } from '../types';

export interface RecordFormState {
  alcoholType: AlcoholType;
  productName: string;
  makerName: string;
  region: string;
  country: string;
  prefecture: string;
  ingredients: string;
  ricePolishingRatio: string;
  sakeMeterValue: string;
  acidity: string;
  grapeVariety: string;
  shochuMaterial: string;
  beerStyle: string;
  volume?: number;
  abv?: number;
  purchasePrice?: number;
  selectedMarketPriceCandidateId: string | null;
  manualMarketPrice?: number;
  capturedAt?: string;
  drankAt: string;
  memo: string;
  tags: string;
  backgroundMode: BackgroundMode;
  scores: Record<string, number>;
  satisfactionScore: number;
  repeatScore: number;
  foodMatchScore: number;
  foodPairing: string;
  glassType: string;
  mood: string;
  priceImpression: string;
}

export function createInitialFormState(type: AlcoholType): RecordFormState {
  return {
    alcoholType: type,
    productName: '',
    makerName: '',
    region: '',
    country: '',
    prefecture: '',
    ingredients: '',
    ricePolishingRatio: '',
    sakeMeterValue: '',
    acidity: '',
    grapeVariety: '',
    shochuMaterial: '',
    beerStyle: '',
    volume: undefined,
    abv: undefined,
    purchasePrice: undefined,
    selectedMarketPriceCandidateId: null,
    manualMarketPrice: undefined,
    capturedAt: undefined,
    drankAt: new Date().toISOString().slice(0, 10),
    memo: '',
    tags: '',
    backgroundMode: 'original',
    scores: initialScores(type),
    satisfactionScore: 4,
    repeatScore: 4,
    foodMatchScore: 4,
    foodPairing: '',
    glassType: '',
    mood: '',
    priceImpression: ''
  };
}

export function initialScores(type: AlcoholType) {
  return Object.fromEntries(alcoholProfiles[type].axes.map((axis) => [axis.key, 3]));
}
