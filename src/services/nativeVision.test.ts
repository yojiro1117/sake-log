import { describe, expect, it } from 'vitest';
import type { NativeTextObservation } from '../platform/visionTypes';
import { aggregateNativeText } from './nativeOcrAggregation';
import { uniqueProductBarcodes } from './nativeBarcodeService';
import { selectOcrRegions } from './nativeLabelDetectionService';

const observation = (text: string, passId: string, confidence = 0.7): NativeTextObservation => ({
  text, passId, confidence, engine: 'apple-vision', regionType: 'frontLabel',
  boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 }
});

describe('native vision evidence handling', () => {
  it('merges repeated passes without treating a single pass as confirmed', () => {
    const result = aggregateNativeText([observation('獺祭', 'label-0'), observation('獺祭', 'full'), observation('純米大吟醸', 'label-0', 0.6)]);
    expect(result.text).toContain('獺祭');
    expect(result.repeatedTerms).toContain('獺祭');
    expect(result.confidence).toBeLessThan(1);
  });

  it('deduplicates grounded barcodes and rejects empty noise', () => {
    expect(uniqueProductBarcodes([
      { rawValue: '4901777233812', format: 'EAN_13', confidence: 1 },
      { rawValue: '4901777233812', format: 'EAN_13', confidence: 0.7 },
      { rawValue: '!', format: 'unknown', confidence: 1 }
    ])).toHaveLength(1);
  });

  it('prioritizes label crops and drops tiny regions', () => {
    const regions = selectOcrRegions([
      { id: 'full', regionType: 'fullImage', confidence: 1, boundingBox: { x: 0, y: 0, width: 1, height: 1 } },
      { id: 'front', regionType: 'frontLabel', confidence: 0.6, boundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } },
      { id: 'noise', regionType: 'frontLabel', confidence: 0.9, boundingBox: { x: 0, y: 0, width: 0.05, height: 0.05 } }
    ]);
    expect(regions.map((item) => item.id)).toEqual(['front', 'full']);
  });
});
