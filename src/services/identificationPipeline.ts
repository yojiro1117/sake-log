import { db } from '../db/db';
import type { IdentificationPath, IdentificationResult } from '../types';
import { rankCatalogCandidates } from './candidateRanking';
import { retrieveCatalogCandidates } from './candidateRetrieval';
import { calibrateIdentificationCandidates } from './confidenceCalibrationService';
import { fuseImageEvidence, type ImageIdentificationInput } from './evidenceFusionService';
import { saveIdentificationResult } from './identificationRepository';
import { loadLocalProductCatalog } from './productCatalogService';
import { scoreVisualReferences } from './visualMatching';

export async function identifyLocalAlcoholProduct(input: {
  images: ImageIdentificationInput[];
  path?: IdentificationPath;
  persist?: boolean;
  signal?: AbortSignal;
}): Promise<IdentificationResult> {
  const started = performance.now();
  const runId = crypto.randomUUID();
  const path = input.path ?? choosePath(input.images);
  if (input.signal?.aborted) throw new DOMException('識別をキャンセルしました。', 'AbortError');
  const fused = fuseImageEvidence(runId, input.images);
  const [catalog, references] = await Promise.all([loadLocalProductCatalog(), db.referenceImages.toArray()]);
  const visualScores: Record<string, number> = {};
  for (const image of input.images) if (image.fingerprint) {
    const scores = scoreVisualReferences(image.fingerprint, references);
    for (const [productId, score] of Object.entries(scores)) visualScores[productId] = Math.max(visualScores[productId] ?? 0, score);
  }
  const retrieved = retrieveCatalogCandidates(fused.text, catalog, path === 'deep' ? 50 : 30);
  const ranked = rankCatalogCandidates(retrieved, {
    text: fused.text,
    ocrConfidence: fused.averageOcrConfidence,
    barcodeValues: fused.barcodeValues,
    imageCount: fused.imageCount,
    repeatedTerms: fused.repeatedTerms,
    visualScores
  });
  const calibration = calibrateIdentificationCandidates(ranked);
  const processingTimeMs = performance.now() - started;
  const result: IdentificationResult = {
    runId, candidates: calibration.candidates, evidences: fused.evidences, abstained: calibration.abstained, path,
    firstCandidateMs: calibration.candidates.length ? processingTimeMs : undefined, processingTimeMs,
    warnings: calibration.reason ? [calibration.reason] : [], errors: []
  };
  if (input.persist !== false) await saveIdentificationResult({
    id: runId,
    imageIds: input.images.map((image) => image.imageId),
    ocrText: fused.text,
    barcodeValues: fused.barcodeValues,
    candidateProductIds: calibration.candidates.flatMap((candidate) => candidate.productId ? [candidate.productId] : []),
    topConfidence: calibration.candidates[0]?.calibratedConfidence,
    abstained: calibration.abstained,
    processingTimeMs,
    path,
    status: 'completed',
    photoTypes: input.images.map((image) => image.imageType),
    warnings: result.warnings,
    errors: [],
    createdAt: new Date().toISOString()
  }, result);
  return result;
}

function choosePath(images: ImageIdentificationInput[]): IdentificationPath {
  const hasBarcode = images.some((image) => image.barcodeValues?.length);
  const strongOcr = images.some((image) => image.ocrConfidence >= 0.78 && image.ocrText.trim().length >= 4);
  if (hasBarcode || strongOcr) return 'fast';
  if (images.length > 1 || images.some((image) => image.ocrText.trim())) return 'standard';
  return 'deep';
}
