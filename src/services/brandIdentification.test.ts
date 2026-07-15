import { describe, expect, it } from 'vitest';
import type { AlcoholProductCatalogEntry, ProductReferenceImage, VisualFingerprint } from '../types';
import { isPlausibleCode } from './barcodeService';
import { rankCatalogCandidates } from './candidateRanking';
import { retrieveCatalogCandidates } from './candidateRetrieval';
import { extractStructuredFields, normalizeOcrForIdentification } from './ocrNormalization';
import { scoreVisualReferences, visualSimilarity } from './visualMatching';

const entry: AlcoholProductCatalogEntry = {
  productId: 'whisky-yamazaki', canonicalProductName: '山崎', brandFamily: '山崎', makerName: 'サントリー',
  alcoholType: 'whisky', aliases: ['THE YAMAZAKI'], kanaAliases: [], latinAliases: ['YAMAZAKI'],
  commonOcrErrors: ['YAMAZAK1'], volumesMl: [700], abvMin: 43, abvMax: 43, janCodes: ['4901777233812'],
  keywords: ['SINGLE MALT'], exclusionKeywords: [], referenceImageIds: [], source: 'built-in', userConfirmed: true,
  hidden: false, createdAt: '2026-01-01', updatedAt: '2026-01-01'
};

describe('brand identification core', () => {
  it('normalizes OCR confusions and extracts volume and ABV', () => {
    const normalized = normalizeOcrForIdentification('ＴＨＥ　YAMAZAK1 700 ml Alcohol 43%');
    expect(normalized.searchable).toContain('theyamazaki');
    expect(extractStructuredFields(normalized.corrected)).toEqual({ volumes: [700], abvs: [43], years: [] });
  });

  it('retrieves and ranks a supported candidate with independent evidence', () => {
    const text = 'THE YAMAZAKI SINGLE MALT サントリー 700ml Alcohol 43%';
    const ranked = rankCatalogCandidates(retrieveCatalogCandidates(text, [entry]), { text, ocrConfidence: 0.72, alcoholTypeHint: 'whisky' });
    expect(ranked[0]).toMatchObject({ productName: '山崎', requiresConfirmation: true, volume: 700, abv: 43 });
    expect(ranked[0].matchReasons).toEqual(expect.arrayContaining([expect.stringContaining('メーカー一致'), expect.stringContaining('容量一致')]));
  });

  it('does not emit an unrelated catalog item', () => {
    expect(retrieveCatalogCandidates('判読できないラベル文字', [entry])).toEqual([]);
  });

  it('validates standard JAN/EAN check digits', () => {
    expect(isPlausibleCode('4901777233812')).toBe(true);
    expect(isPlausibleCode('4901777233813')).toBe(false);
  });

  it('uses only confirmed visual references', () => {
    const fingerprint: VisualFingerprint = { hash: '0'.repeat(64), luminance: [], colorHistogram: Array(24).fill(0.1), aspectRatio: 0.7 };
    const different: VisualFingerprint = { ...fingerprint, hash: 'f'.repeat(64) };
    const references: ProductReferenceImage[] = [
      { id: 'a', productId: entry.productId, imageHash: 'a', fingerprint, userConfirmed: true, createdAt: '2026-01-01' },
      { id: 'b', productId: 'unconfirmed', imageHash: 'b', fingerprint, userConfirmed: false, createdAt: '2026-01-01' }
    ];
    expect(visualSimilarity(fingerprint, fingerprint)).toBe(1);
    expect(visualSimilarity(fingerprint, different)).toBeLessThan(0.3);
    expect(scoreVisualReferences(fingerprint, references)).toEqual({ [entry.productId]: 1 });
  });
});
