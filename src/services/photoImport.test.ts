import { describe, expect, it } from 'vitest';
import { buildCandidates } from './photoImport';

const dassai = '\u737a\u796d';
const asahi = '\u65ed\u9152\u9020';
const kuroKirishima = '\u9ed2\u9727\u5cf6';
const kuroKiriBird = '\u9ed2\u9727\u9ce5';
const kirishima = '\u9727\u5cf6\u9152\u9020';
const yamazaki = '\u5c71\u5d0e';
const suntory = '\u30b5\u30f3\u30c8\u30ea\u30fc';

describe('photoImport candidates', () => {
  it('does not show fixed famous labels when OCR text is empty', () => {
    expect(buildCandidates('')).toEqual([]);
    expect(buildCandidates(undefined)).toEqual([]);
  });

  it('returns structured candidate with alcohol type when OCR text matches a master label', () => {
    const candidates = buildCandidates(`DASSAI 45 720ml ${asahi}`);
    expect(candidates[0]).toMatchObject({
      productName: dassai,
      makerName: asahi,
      alcoholType: 'sake',
      volume: 720
    });
    expect(candidates[0].matchReasons.length).toBeGreaterThan(0);
  });

  it('corrects common OCR confusion without auto-confirming', () => {
    const candidates = buildCandidates(`${kuroKiriBird} 25\u5ea6 900ml ${kirishima}`);
    expect(candidates[0]).toMatchObject({
      productName: kuroKirishima,
      makerName: kirishima,
      alcoholType: 'shochu'
    });
  });

  it('maps THE YAMAZAKI to whisky, not sake', () => {
    const candidates = buildCandidates(`THE YAMAZAKI SINGLE MALT WHISKY ${suntory}`);
    expect(candidates[0]).toMatchObject({
      productName: yamazaki,
      alcoholType: 'whisky'
    });
  });

  it('uses raw OCR text only as a low confidence editable candidate', () => {
    const candidates = buildCandidates('Unknown Label\n720ml');
    expect(candidates[0]).toMatchObject({
      productName: 'Unknown Label',
      confidence: 'low'
    });
    expect(candidates[0].warning).toBeTruthy();
  });
});
