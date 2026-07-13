import { describe, expect, it } from 'vitest';
import { createCandidateFromRakuten, manualPriceCandidate, selectedPriceSnapshot } from './priceService';

describe('priceService', () => {
  it('calculates match reasons and exclusion reasons', () => {
    const candidate = createCandidateFromRakuten(
      {
        itemName: '獺祭 純米大吟醸 720ml ギフトセット',
        itemPrice: 3300,
        itemUrl: 'https://example.com',
        shopName: 'テスト店',
        postageFlag: 0
      },
      { productName: '獺祭', makerName: '旭酒造', volume: 720, alcoholType: 'sake' },
      '2026-01-01T00:00:00.000Z'
    );
    expect(candidate.matchReasons).toContain('銘柄名一致');
    expect(candidate.matchReasons).toContain('容量一致');
    expect(candidate.excludedReasons.join(',')).toContain('ギフト');
    expect(candidate.recommended).toBe(false);
  });

  it('saves manual price as manual source with null selected candidate', () => {
    const candidate = manualPriceCandidate(1800);
    const snapshot = selectedPriceSnapshot(undefined, candidate.price);
    expect(snapshot).toMatchObject({
      candidateId: null,
      adoptedMarketPrice: 1800,
      source: 'manual',
      priceConfidence: 'manual'
    });
  });
});
