import type { CandidateMatch, ConfidenceLevel } from '../types';

export function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= 90) return 'high';
  if (value >= 70) return 'medium';
  return 'low';
}

export function confidenceLabel(value: number) {
  const level = confidenceLevel(value);
  return level === 'high' ? '高信頼' : level === 'medium' ? '要確認' : '手動確認推奨';
}

export function scoreCandidate(input: {
  ocrConfidence: number;
  productMatch: number;
  makerMatch?: number;
  alcoholTypeMatch?: number;
  volumeMatch?: number;
  learningAdjustment?: number;
}): Pick<
  CandidateMatch,
  'ocrConfidence' | 'productConfidence' | 'makerConfidence' | 'alcoholTypeConfidence' | 'volumeConfidence' | 'totalConfidence' | 'requiresConfirmation'
> {
  const ocr = clamp(input.ocrConfidence * 100);
  const product = clamp(input.productMatch);
  const maker = clamp(input.makerMatch ?? 0);
  const alcohol = clamp(input.alcoholTypeMatch ?? 0);
  const volume = clamp(input.volumeMatch ?? 0);
  const total = clamp(ocr * 0.25 + product * 0.4 + maker * 0.15 + alcohol * 0.1 + volume * 0.1 + (input.learningAdjustment ?? 0));
  return {
    ocrConfidence: Math.round(ocr),
    productConfidence: Math.round(product),
    makerConfidence: Math.round(maker),
    alcoholTypeConfidence: Math.round(alcohol),
    volumeConfidence: Math.round(volume),
    totalConfidence: Math.round(total),
    requiresConfirmation: true
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
