import { describe, expect, it } from 'vitest';
import { createInitialFormState } from '../services/recordForm';

describe('Record form state', () => {
  it('resets product, price, scores, OCR-derived fields and dates', () => {
    const form = createInitialFormState('beer');
    expect(form.productName).toBe('');
    expect(form.makerName).toBe('');
    expect(form.selectedMarketPriceCandidateId).toBeNull();
    expect(form.manualMarketPrice).toBeUndefined();
    expect(form.capturedAt).toBeUndefined();
    expect(Object.keys(form.scores)).toContain('bitterness');
  });
});
