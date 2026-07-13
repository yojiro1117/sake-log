import { describe, expect, it } from 'vitest';
import { scoreOcrVariant } from './ocrPreprocessing';

describe('ocrPreprocessing scoring', () => {
  it('prefers a variant with candidate matches over longer noisy text', () => {
    const noisy = scoreOcrVariant({
      text: 'random background menu text price tax shop',
      confidence: 0.61,
      candidateCount: 0,
      variantKind: 'original'
    });
    const matched = scoreOcrVariant({
      text: '獺祭 720ml 旭酒造',
      confidence: 0.55,
      candidateCount: 1,
      variantKind: 'centerCrop'
    });
    expect(matched).toBeGreaterThan(noisy);
  });
});
