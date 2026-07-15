import { builtInAlcoholProductCatalog } from '../data/alcoholProductCatalog';
import { db } from '../db/db';
import type { AlcoholType, CandidateMatch, LearningDecision, VisualFingerprint } from '../types';

export async function recordIdentificationRun(input: {
  imageIds:string[]; text:string; barcodes:string[]; candidates:CandidateMatch[]; processingTimeMs:number;
}) {
  const id = crypto.randomUUID();
  await db.identificationRuns.put({
    id, imageIds:input.imageIds, ocrText:input.text, barcodeValues:input.barcodes,
    candidateProductIds:input.candidates.flatMap((item) => item.productId ? [item.productId] : []),
    topConfidence:input.candidates[0]?.calibratedConfidence, abstained:input.candidates.length === 0,
    processingTimeMs:input.processingTimeMs, createdAt:new Date().toISOString()
  });
  return id;
}

export async function recordLearningDecision(input: {
  candidate?:CandidateMatch;
  runId:string;
  decision:LearningDecision;
  finalProductName:string;
  finalMakerName?:string;
  finalAlcoholType:AlcoholType;
  reference?:{
    imageHash:string;
    sourceImageId:string;
    fingerprint:VisualFingerprint;
    photoType?:'frontLabel'|'backLabel'|'bottle'|'neckLabel'|'barcode'|'receipt'|'glass'|'food'|'cap'|'shelf'|'multipleBottles'|'other'|'unknown';
    qualityLevel?:'good'|'fair'|'poor';
    learningEventId?:string;
  };
}) {
  const eventId = input.reference?.learningEventId
    ?? `${input.runId}:${input.reference?.imageHash ?? 'no-image'}:${input.candidate?.productId ?? input.finalProductName}:${input.decision}`;
  await db.transaction('rw', db.learningEvents, db.productCatalog, db.referenceImages, async () => {
    if (await db.learningEvents.get(eventId)) return;
    const now = new Date().toISOString();
    let confirmedProductId = input.decision === 'accepted' ? input.candidate?.productId : undefined;
    if (input.decision === 'corrected' || input.decision === 'manual-new') {
      const normalize = (value?:string) => value?.normalize('NFKC').replace(/\s/g, '').toLowerCase() ?? '';
      const localCatalog = await db.productCatalog.toArray();
      const existing = [...localCatalog, ...builtInAlcoholProductCatalog].find((entry) =>
        normalize(entry.canonicalProductName) === normalize(input.finalProductName)
        && (!input.finalMakerName || normalize(entry.makerName) === normalize(input.finalMakerName))
      );
      confirmedProductId = existing?.productId ?? `user-${crypto.randomUUID()}`;
      if (!existing) await db.productCatalog.put({
        productId:confirmedProductId,
        brandFamily:input.finalProductName.trim(),
        canonicalProductName:input.finalProductName.trim(),
        makerName:input.finalMakerName?.trim() || '不明',
        alcoholType:input.finalAlcoholType,
        aliases:[input.finalProductName.trim()],
        kanaAliases:[], latinAliases:[], commonOcrErrors:[], volumesMl:[], janCodes:[], keywords:[],
        exclusionKeywords:[], referenceImageIds:[], source:'user-confirmed', userConfirmed:true,
        createdAt:now, updatedAt:now
      });
    }
    await db.learningEvents.put({
      id:eventId, runId:input.runId, proposedProductId:input.candidate?.productId,
      confirmedProductId,
      action:input.decision, finalProductName:input.finalProductName, finalMakerName:input.finalMakerName,
      createdAt:now
    });
    if (!confirmedProductId) return;
    if (input.decision === 'accepted') {
      const existing = await db.productCatalog.get(confirmedProductId);
      const builtIn = builtInAlcoholProductCatalog.find((item) => item.productId === confirmedProductId);
      if (existing) await db.productCatalog.update(confirmedProductId, { userConfirmed:true, source:'user-confirmed', updatedAt:now });
      else if (builtIn) await db.productCatalog.put({ ...builtIn, userConfirmed:true, source:'user-confirmed', updatedAt:now });
    }
    const referenceAllowed = input.reference
      && ['frontLabel','backLabel','bottle','neckLabel'].includes(input.reference.photoType ?? '')
      && ['good','fair'].includes(input.reference.qualityLevel ?? '');
    if (referenceAllowed && input.reference) await db.referenceImages.put({
      id:`${confirmedProductId}:${input.reference.imageHash}`, productId:confirmedProductId, imageHash:input.reference.imageHash,
      fingerprint:input.reference.fingerprint, sourceImageId:input.reference.sourceImageId,
      photoType:input.reference.photoType, qualityLevel:input.reference.qualityLevel,
      userConfirmed:true, createdAt:now
    });
  });
}

export function determineLearningDecision(
  candidate:CandidateMatch | undefined,
  final:{ productName:string; makerName?:string }
): LearningDecision {
  if (!candidate) return 'manual-new';
  const normalize = (value?:string) => value?.normalize('NFKC').replace(/\s/g, '').toLowerCase() ?? '';
  const productMatches = normalize(candidate.productName) === normalize(final.productName);
  const makerMatches = !candidate.makerName || !final.makerName || normalize(candidate.makerName) === normalize(final.makerName);
  return productMatches && makerMatches ? 'accepted' : 'corrected';
}
