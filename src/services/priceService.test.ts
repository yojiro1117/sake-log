import { describe, expect, it } from 'vitest';
import { buildPriceSearchQueries, createCandidateFromRakuten, manualPriceCandidate, selectedPriceSnapshot } from './priceService';

const dassai = '\u737a\u796d';
const asahi = '\u65ed\u9152\u9020';
const giftSet = '\u30ae\u30d5\u30c8\u30bb\u30c3\u30c8';

describe('priceService', () => {
  it('calculates match reasons and exclusion reasons', () => {
    const candidate = createCandidateFromRakuten(
      {
        itemName: `${dassai} \u7d14\u7c73\u5927\u541f\u91b8 720ml ${giftSet}`,
        itemPrice: 3300,
        itemUrl: 'https://example.com',
        shopName: '\u30c6\u30b9\u30c8\u5e97',
        postageFlag: 0
      },
      { productName: dassai, makerName: asahi, volume: 720, alcoholType: 'sake' },
      '2026-01-01T00:00:00.000Z'
    );
    expect(candidate.matchReasons.length).toBeGreaterThanOrEqual(2);
    expect(candidate.excludedReasons.join(',')).toContain('\u30ae\u30d5\u30c8');
    expect(candidate.excludedReasons.join(',')).toContain('\u30bb\u30c3\u30c8');
    expect(candidate.recommended).toBe(false);
    expect(candidate.totalPrice).toBeUndefined();
  });

  it('keeps shipping-included totals separate from unknown shipping', () => {
    const included = createCandidateFromRakuten(
      { itemName:`${dassai} 720ml`, itemPrice:3300, itemUrl:'https://example.com/1', shopName:'店', postageFlag:1 },
      { productName:dassai, volume:720, alcoholType:'sake' },
      '2026-01-01T00:00:00.000Z'
    );
    expect(included).toMatchObject({ shippingIncluded:true, totalPrice:3300 });
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

  it('builds multiple search query patterns without committing secrets', () => {
    const queries = buildPriceSearchQueries({
      productName: dassai,
      makerName: asahi,
      volume: 720,
      ocrText: `DASSAI 45 720ml ${asahi}`,
      aliases: ['DASSAI']
    });
    expect(queries).toContain(`${dassai} ${asahi} 720ml`);
    expect(queries).toContain(`${dassai} 720ml`);
    expect(queries).toContain(`DASSAI ${asahi} 720ml`);
    expect(queries.some((query) => query.includes('DASSAI 45'))).toBe(true);
  });
});
