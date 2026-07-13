import { describe, expect, it } from 'vitest';
import { buildCandidates } from './photoImport';

describe('photoImport candidates', () => {
  it('does not show fixed famous labels when OCR text is empty', () => {
    expect(buildCandidates('')).toEqual([]);
    expect(buildCandidates(undefined)).toEqual([]);
  });

  it('returns structured candidate with alcohol type when OCR text matches a master label', () => {
    const candidates = buildCandidates('DASSAI 45 720ml 旭酒造');
    expect(candidates[0]).toMatchObject({
      productName: '獺祭',
      makerName: '旭酒造',
      alcoholType: 'sake'
    });
    expect(candidates[0].matchReasons).toContain('銘柄名一致');
  });

  it('uses raw OCR text only as a low confidence editable candidate', () => {
    const candidates = buildCandidates('Unknown Label\n720ml');
    expect(candidates[0]).toMatchObject({
      productName: 'Unknown Label',
      confidence: 'low'
    });
    expect(candidates[0].warning).toContain('必ず内容を確認');
  });
});
