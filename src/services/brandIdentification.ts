import { builtInAlcoholProductCatalog, mergeCatalogEntries } from '../data/alcoholProductCatalog';
import { db } from '../db/db';
import type { CandidateMatch, ImportedPhotoDraft, VisualFingerprint } from '../types';
import { retrieveCatalogCandidates } from './candidateRetrieval';
import { rankCatalogCandidates } from './candidateRanking';
import { normalizeCatalogTerm } from './ocrNormalization';
import { scoreVisualReferences } from './visualMatching';

export interface IdentificationInput {
  text: string;
  ocrConfidence: number;
  barcodeValues?: string[];
  imageCount?: number;
  repeatedTerms?: string[];
  visualScores?: Record<string, number>;
  fingerprint?: VisualFingerprint;
  catalog?: typeof builtInAlcoholProductCatalog;
}

export function identifyAlcoholProduct(input: IdentificationInput): CandidateMatch[] {
  return identifyAlcoholProductAtCycle(input, 5);
}

export function identifyAlcoholProductAtCycle(input: IdentificationInput, cycle: 1 | 2 | 3 | 4 | 5): CandidateMatch[] {
  const catalog = input.catalog ?? builtInAlcoholProductCatalog;
  if (cycle === 1) {
    const searchable = input.text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
    return catalog.filter((entry) => [entry.brandFamily, ...entry.aliases, ...entry.latinAliases].some((term) => searchable.includes(term.normalize('NFKC').toLowerCase().replace(/\s/g, ''))))
      .slice(0, 5).map((entry, index) => ({ productId:entry.productId, brandFamily:entry.brandFamily, productName:entry.canonicalProductName, makerName:entry.makerName, alcoholType:entry.alcoholType, confidence:'medium', matchReasons:['正規化前の部分一致'], totalConfidence:58, rank:index + 1, requiresConfirmation:true }));
  }
  const retrieved = retrieveCatalogCandidates(input.text, catalog, 20);
  if (cycle === 2) return retrieved.slice(0, 5).map((item, index) => ({
    productId:item.entry.productId, brandFamily:item.entry.brandFamily, productName:item.entry.canonicalProductName,
    variantName:item.entry.variantName, makerName:item.entry.makerName, alcoholType:item.entry.alcoholType,
    confidence:item.retrievalScore >= 75 ? 'high' : 'medium', matchReasons:item.retrievalReasons,
    totalConfidence:item.retrievalScore, rank:index + 1, requiresConfirmation:true
  }));
  const context = cycle === 3 ? { text:input.text, ocrConfidence:input.ocrConfidence } : cycle === 4 ? { ...input, visualScores:undefined, fingerprint:undefined } : input;
  const ranked = rankCatalogCandidates(retrieved, context);
  if (cycle < 5 || ranked.length === 0) return ranked;
  const top = ranked[0].calibratedConfidence ?? 0;
  const margin = top - (ranked[1]?.calibratedConfidence ?? 0);
  const evidenceKinds = new Set(ranked[0].evidences?.map((item) => item.kind));
  const strong = evidenceKinds.has('jan') || evidenceKinds.has('exact') || (evidenceKinds.has('alias') && evidenceKinds.has('maker'));
  if (top < 45 || (top < 62 && margin < 8 && !strong)) return [];
  return ranked;
}

export async function identifyAlcoholProductWithLocalData(input: IdentificationInput): Promise<CandidateMatch[]> {
  const [stored, references] = await Promise.all([db.productCatalog.toArray(), db.referenceImages.toArray()]);
  const catalog = mergeCatalogEntries(stored);
  const visualScores = { ...input.visualScores };
  if (input.fingerprint) Object.assign(visualScores, scoreVisualReferences(input.fingerprint, references));
  return identifyAlcoholProduct({ ...input, catalog, visualScores });
}

export function repeatedOcrTerms(drafts: ImportedPhotoDraft[]) {
  const counts = new Map<string, number>();
  for (const draft of drafts) {
    const terms = new Set(draft.ocr.text.split(/[\s\p{P}\p{S}]+/u).map(normalizeCatalogTerm).filter((term) => term.length >= 2));
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count >= 2).map(([term]) => term);
}

export async function recordIdentificationRun(input: {
  imageIds: string[]; text: string; barcodes: string[]; candidates: CandidateMatch[]; processingTimeMs: number;
}) {
  const id = crypto.randomUUID();
  await db.identificationRuns.put({
    id, imageIds: input.imageIds, ocrText: input.text, barcodeValues: input.barcodes,
    candidateProductIds: input.candidates.flatMap((item) => item.productId ? [item.productId] : []),
    topConfidence: input.candidates[0]?.calibratedConfidence, abstained: input.candidates.length === 0,
    processingTimeMs: input.processingTimeMs, createdAt: new Date().toISOString()
  });
  return id;
}

export async function confirmCatalogCandidate(candidate: CandidateMatch, runId: string, action: 'accepted' | 'corrected' | 'rejected', reference?: { imageHash: string; sourceImageId: string; fingerprint: VisualFingerprint }) {
  await db.learningEvents.put({ id:crypto.randomUUID(), runId, proposedProductId:candidate.productId, confirmedProductId:action === 'accepted' ? candidate.productId : undefined, action, createdAt:new Date().toISOString() });
  if (action !== 'accepted' || !candidate.productId) return;
  const existing = await db.productCatalog.get(candidate.productId);
  const builtIn = builtInAlcoholProductCatalog.find((item) => item.productId === candidate.productId);
  if (existing) await db.productCatalog.update(candidate.productId, { userConfirmed:true, source:'user-confirmed', updatedAt:new Date().toISOString() });
  else if (builtIn) await db.productCatalog.put({ ...builtIn, userConfirmed:true, source:'user-confirmed', updatedAt:new Date().toISOString() });
  if (reference) await db.referenceImages.put({ id:`${candidate.productId}:${reference.imageHash}`, productId:candidate.productId, imageHash:reference.imageHash, fingerprint:reference.fingerprint, sourceImageId:reference.sourceImageId, userConfirmed:true, createdAt:new Date().toISOString() });
}
