import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SakeLogDatabase } from '../db/db';
import type { AlcoholProductCatalogEntry, ProductReferenceImage, VisualFingerprint } from '../types';
import { retrieveBarcodeCandidates, retrieveVisualCandidates, unionRetrievedCandidates } from './candidateRetrieval';
import { determineLearningDecision } from './identificationLearningService';

const fingerprint:VisualFingerprint = {
  hash:'0'.repeat(64), luminance:Array(256).fill(120), colorHistogram:Array(24).fill(1 / 24), aspectRatio:0.7
};
const catalog:AlcoholProductCatalogEntry[] = [{
  productId:'yamazaki', brandFamily:'山崎', canonicalProductName:'山崎', makerName:'サントリー', alcoholType:'whisky',
  aliases:['山崎'], kanaAliases:[], latinAliases:['THE YAMAZAKI'], commonOcrErrors:[], volumesMl:[700], janCodes:['4901777233812'],
  keywords:[], exclusionKeywords:[], referenceImageIds:[], source:'built-in', userConfirmed:false,
  createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z'
}];

describe('independent identification retrieval', () => {
  it('retrieves by barcode when OCR text is empty', () => {
    const candidates = retrieveBarcodeCandidates(['4901777233812'], catalog);
    expect(candidates.map((item) => item.entry.productId)).toEqual(['yamazaki']);
  });

  it('retrieves by confirmed visual reference when OCR text is empty', () => {
    const candidates = retrieveVisualCandidates({ yamazaki:0.88 }, catalog);
    expect(candidates[0]).toMatchObject({ entry:{ productId:'yamazaki' }, sources:['visual'] });
  });

  it('unions evidence sources before ranking', () => {
    const barcode = retrieveBarcodeCandidates(['4901777233812'], catalog);
    const visual = retrieveVisualCandidates({ yamazaki:0.88 }, catalog);
    expect(unionRetrievedCandidates(barcode, visual)[0].sources).toEqual(['barcode', 'visual']);
  });
});

describe('learning decision safety', () => {
  it('does not accept a stale selected candidate after form edits', () => {
    expect(determineLearningDecision(
      { productId:'yamazaki', productName:'山崎', makerName:'サントリー', confidence:'high', matchReasons:[] },
      { productName:'白州', makerName:'サントリー' }
    )).toBe('corrected');
  });

  it('treats an unselected saved product as a new manual product', () => {
    expect(determineLearningDecision(undefined, { productName:'新しい銘柄' })).toBe('manual-new');
  });
});

describe('reference database isolation', () => {
  let database:SakeLogDatabase;
  beforeEach(() => { database = new SakeLogDatabase(`identification-test-${crypto.randomUUID()}`); });
  afterEach(async () => { await database.delete(); });

  it('stores only explicitly confirmed references', async () => {
    const reference:ProductReferenceImage = {
      id:'ref', productId:'yamazaki', imageHash:'hash', fingerprint, userConfirmed:true, createdAt:new Date().toISOString()
    };
    await database.referenceImages.put(reference);
    expect((await database.referenceImages.toArray()).filter((item) => item.userConfirmed)).toHaveLength(1);
  });
});
