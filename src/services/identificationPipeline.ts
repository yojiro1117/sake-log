import { db } from '../db/db';
import type { IdentificationPath, IdentificationResult } from '../types';
import { rankCatalogCandidates } from './candidateRanking';
import {
  retrieveBarcodeCandidates,
  retrieveCatalogCandidates,
  retrieveProductIdCandidates,
  retrieveVisualCandidates,
  unionRetrievedCandidates
} from './candidateRetrieval';
import { calibrateIdentificationCandidates } from './confidenceCalibrationService';
import { fuseImageEvidence, type ImageIdentificationInput } from './evidenceFusionService';
import { saveIdentificationResult } from './identificationRepository';
import { normalizeCatalogTerm } from './ocrNormalization';
import { loadLocalProductCatalog } from './productCatalogService';
import { scoreVisualReferences } from './visualMatching';

export async function identifyAlcoholProductEvidencePipeline(input: {
  images: ImageIdentificationInput[];
  path?: IdentificationPath;
  persist?: boolean;
  signal?: AbortSignal;
}): Promise<IdentificationResult> {
  const started = performance.now();
  const runId = crypto.randomUUID();
  const path = input.path ?? choosePath(input.images);
  if (input.signal?.aborted) throw new DOMException('識別をキャンセルしました。', 'AbortError');
  const fusionStarted = performance.now();
  const fused = fuseImageEvidence(runId, input.images);
  const fusionMs = performance.now() - fusionStarted;
  const loadStarted = performance.now();
  const [catalog, references, corrections, history] = await Promise.all([
    loadLocalProductCatalog(),
    db.referenceImages.toArray(),
    db.ocrCorrections.toArray(),
    db.logs.orderBy('updatedAt').reverse().limit(250).toArray()
  ]);
  const loadMs = performance.now() - loadStarted;
  const visualScores: Record<string, number> = {};
  for (const image of input.images) if (image.fingerprint) {
    const scores = scoreVisualReferences(image.fingerprint, references);
    for (const [productId, score] of Object.entries(scores)) visualScores[productId] = Math.max(visualScores[productId] ?? 0, score);
  }
  const normalizedText = normalizeCatalogTerm(fused.text);
  const productIdByIdentity = new Map(catalog.flatMap((entry) => [
    [normalizeCatalogTerm(entry.canonicalProductName), entry.productId] as const,
    [normalizeCatalogTerm(`${entry.canonicalProductName}${entry.makerName}`), entry.productId] as const
  ]));
  const correctionIds = corrections.flatMap((entry) => {
    const observed = [entry.observedText, ...(entry.aliases ?? [])].some((value) => normalizedText.includes(normalizeCatalogTerm(value)));
    if (!observed) return [];
    const id = productIdByIdentity.get(normalizeCatalogTerm(entry.correctedProductName))
      ?? productIdByIdentity.get(normalizeCatalogTerm(`${entry.correctedProductName}${entry.correctedMakerName ?? ''}`));
    return id ? [id] : [];
  });
  const historyIds = history.flatMap((log) => {
    const product = normalizeCatalogTerm(log.productName);
    const maker = normalizeCatalogTerm(log.makerName ?? '');
    if (!product || (!normalizedText.includes(product) && (!maker || !normalizedText.includes(maker)))) return [];
    const id = productIdByIdentity.get(product) ?? productIdByIdentity.get(normalizeCatalogTerm(`${log.productName}${log.makerName ?? ''}`));
    return id ? [id] : [];
  });
  const textCandidates = retrieveCatalogCandidates(fused.text, catalog, path === 'deep' ? 50 : 30);
  const barcodeCandidates = retrieveBarcodeCandidates(fused.barcodeValues, catalog);
  const visualCandidates = retrieveVisualCandidates(visualScores, catalog, 0.84);
  const historyCandidates = retrieveProductIdCandidates(historyIds, catalog, 'history', '過去ログの確認済み銘柄と一致', 68);
  const correctionCandidates = retrieveProductIdCandidates(correctionIds, catalog, 'correction', 'ユーザー修正履歴と一致', 74);
  const multiPhotoIds = input.images.length > 1
    ? textCandidates.filter((item) => fused.repeatedTerms.some((term) => item.matchedTerms.some((matched) => normalizeCatalogTerm(matched).includes(term)))).map((item) => item.entry.productId)
    : [];
  const multiPhotoCandidates = retrieveProductIdCandidates(multiPhotoIds, catalog, 'multi-photo', '複数写真で一致語を確認', 72);
  const retrieved = unionRetrievedCandidates(textCandidates, barcodeCandidates, visualCandidates, historyCandidates, correctionCandidates, multiPhotoCandidates);
  const retrievalMs = performance.now() - loadStarted - loadMs;
  const rankingStarted = performance.now();
  const ranked = rankCatalogCandidates(retrieved, {
    text: fused.text,
    ocrConfidence: fused.averageOcrConfidence,
    barcodeValues: fused.barcodeValues,
    imageCount: fused.imageCount,
    repeatedTerms: fused.repeatedTerms,
    visualScores
  });
  const calibration = calibrateIdentificationCandidates(ranked);
  const rankingMs = performance.now() - rankingStarted;
  const processingTimeMs = performance.now() - started;
  const result: IdentificationResult = {
    runId, candidates: calibration.candidates, evidences: fused.evidences, abstained: calibration.abstained, path,
    firstCandidateMs: calibration.candidates.length ? processingTimeMs : undefined, processingTimeMs,
    warnings: calibration.reason ? [calibration.reason] : [], errors: [],
    retrieval: {
      textCandidates:textCandidates.map((item) => item.entry.productId),
      barcodeCandidates:barcodeCandidates.map((item) => item.entry.productId),
      visualCandidates:visualCandidates.map((item) => item.entry.productId),
      historyCandidates:historyCandidates.map((item) => item.entry.productId),
      correctionCandidates:correctionCandidates.map((item) => item.entry.productId),
      multiPhotoCandidates:multiPhotoCandidates.map((item) => item.entry.productId)
    },
    stageTimings:{ fusionMs, loadMs, retrievalMs, rankingMs }
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
