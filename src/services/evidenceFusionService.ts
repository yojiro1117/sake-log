import type { IdentificationEvidence, IdentificationPhotoType, VisualFingerprint } from '../types';
import { normalizeCatalogTerm } from './ocrNormalization';

export interface ImageIdentificationInput {
  imageId: string;
  imageType: IdentificationPhotoType;
  ocrText: string;
  ocrConfidence: number;
  barcodeValues?: string[];
  imageHash?: string;
  fingerprint?: VisualFingerprint;
}

export function fuseImageEvidence(runId: string, images: ImageIdentificationInput[]) {
  const ordered = [...images].sort((left, right) => imagePriority(left.imageType) - imagePriority(right.imageType));
  const text = ordered.map((image) => image.ocrText.trim()).filter(Boolean).join('\n---\n');
  const termCounts = new Map<string, number>();
  const evidences: IdentificationEvidence[] = [];
  for (const image of ordered) {
    for (const token of new Set(image.ocrText.split(/[\s\p{P}\p{S}]+/u).map(normalizeCatalogTerm).filter((item) => item.length >= 2))) {
      termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
    }
    for (const value of image.barcodeValues ?? []) evidences.push(createEvidence(runId, image.imageId, 'barcode', value, 'barcode', 0.98));
  }
  return {
    text,
    averageOcrConfidence: ordered.reduce((sum, image) => sum + image.ocrConfidence, 0) / Math.max(1, ordered.length),
    barcodeValues: [...new Set(ordered.flatMap((image) => image.barcodeValues ?? []))],
    repeatedTerms: [...termCounts].filter(([, count]) => count >= 2).map(([term]) => term),
    evidences,
    imageCount: ordered.length
  };
}

function createEvidence(runId: string, imageId: string, field: IdentificationEvidence['field'], value: string | number, method: IdentificationEvidence['method'], confidence: number): IdentificationEvidence {
  return { id: crypto.randomUUID(), runId, field, value, sourceImageId: imageId, method, confidence, createdAt: new Date().toISOString() };
}

function imagePriority(type: IdentificationPhotoType) {
  const priorities: Partial<Record<IdentificationPhotoType, number>> = { frontLabel: 0, backLabel: 1, neckLabel: 2, barcode: 3, bottle: 4, receipt: 5 };
  return priorities[type] ?? 9;
}
