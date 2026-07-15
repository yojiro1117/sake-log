import { describe, expect, it } from 'vitest';
import type { CandidateMatch, VisualFingerprint } from '../types';
import { calibrateIdentificationCandidates } from './confidenceCalibrationService';
import { fuseImageEvidence } from './evidenceFusionService';
import { classifyIdentificationPhoto } from './photoClassificationService';
import { createVisualFingerprintFromRgba, visualSimilarity } from './visualMatching';

function candidate(kinds: NonNullable<CandidateMatch['evidences']>[number]['kind'][], score = 90): CandidateMatch {
  return {
    productName:'候補', confidence:'high', matchReasons:kinds, totalConfidence:score, calibratedConfidence:score, requiresConfirmation:true,
    evidences:kinds.map((kind) => ({ kind, score:10, detail:kind }))
  };
}

describe('identification pipeline components', () => {
  it('abstains from a visual-only candidate even when its raw score is high', () => {
    const result = calibrateIdentificationCandidates([candidate(['visual'], 95), candidate(['fuzzy'], 92)]);
    expect(result.abstained).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it('keeps independent product and maker evidence but still requires confirmation', () => {
    const result = calibrateIdentificationCandidates([candidate(['alias','maker'], 91)]);
    expect(result.abstained).toBe(false);
    expect(result.candidates[0]).toMatchObject({ requiresConfirmation:true, confidence:'high' });
  });

  it('combines repeated text and barcodes from multiple photos', () => {
    const result = fuseImageEvidence('run', [
      { imageId:'front', imageType:'frontLabel', ocrText:'獺祭 45', ocrConfidence:0.7, barcodeValues:[] },
      { imageId:'back', imageType:'backLabel', ocrText:'旭酒造 獺祭 720ml', ocrConfidence:0.8, barcodeValues:['4900000000000'] }
    ]);
    expect(result.repeatedTerms).toContain('獺祭');
    expect(result.barcodeValues).toEqual(['4900000000000']);
    expect(result.evidences[0]).toMatchObject({ field:'barcode', sourceImageId:'back' });
  });

  it('classifies a valid barcode photo independently of OCR density', () => {
    expect(classifyIdentificationPhoto({ baseType:'other', baseConfidence:30, ocrText:'', barcodeValues:['4900000000000'] })).toMatchObject({ type:'barcode', confidence:96 });
  });

  it('classifies back labels from structural terms', () => {
    expect(classifyIdentificationPhoto({ baseType:'bottle', baseConfidence:40, ocrText:'原材料 米 内容量 720ml 製造者' })).toMatchObject({ type:'backLabel' });
  });

  it('creates dHash, aHash, pHash, edge and layout features', () => {
    const rgba = Array.from({ length:17 * 16 * 4 }, (_, index) => index % 4 === 3 ? 255 : index % 251);
    const fingerprint = createVisualFingerprintFromRgba(rgba, 0.7);
    expect(fingerprint.hash).toHaveLength(64);
    expect(fingerprint.averageHash).toHaveLength(64);
    expect(fingerprint.perceptualHash).toHaveLength(64);
    expect(fingerprint.edgeHistogram).toHaveLength(8);
    expect(fingerprint.layoutSignature).toHaveLength(16);
  });

  it('returns perfect similarity for the same composite fingerprint', () => {
    const fingerprint: VisualFingerprint = {
      hash:'0'.repeat(64), averageHash:'f'.repeat(64), perceptualHash:'a'.repeat(64), luminance:[],
      colorHistogram:Array(24).fill(0.1), edgeHistogram:Array(8).fill(0.125), layoutSignature:Array(16).fill(0.5), aspectRatio:0.7
    };
    expect(visualSimilarity(fingerprint, fingerprint)).toBe(1);
  });
});
