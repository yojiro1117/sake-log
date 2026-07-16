import type { ProductIdentificationInput } from '../platform/visionTypes';
import type { IdentificationPath, IdentificationResult, VisualFingerprint } from '../types';
import type { ImageIdentificationInput } from './evidenceFusionService';
import { identifyAlcoholProductEvidencePipeline } from './identificationPipeline';
import { aggregateNativeText } from './nativeOcrAggregation';
import { uniqueProductBarcodes } from './nativeBarcodeService';

export type LegacyIdentificationInput = {
  images: ImageIdentificationInput[];
  path?: IdentificationPath;
  persist?: boolean;
  signal?: AbortSignal;
};

export async function identifyAlcoholProductPipeline(
  input: ProductIdentificationInput | LegacyIdentificationInput,
  options: { path?: IdentificationPath; persist?: boolean; signal?: AbortSignal } = {}
): Promise<IdentificationResult> {
  if (isLegacyInput(input)) return identifyAlcoholProductEvidencePipeline(input);
  const images: ImageIdentificationInput[] = input.images.map((image) => {
    const aggregated = aggregateNativeText(image.textObservations);
    const barcodes = uniqueProductBarcodes(image.barcodeObservations);
    return {
      imageId: image.imageId,
      imageType: image.photoType,
      ocrText: aggregated.text,
      ocrConfidence: aggregated.confidence,
      barcodeValues: barcodes.map((item) => item.rawValue),
      fingerprint: image.visualEmbedding ? embeddingToFingerprint(image.visualEmbedding) : undefined
    };
  });
  return identifyAlcoholProductEvidencePipeline({ images, path: options.path, persist: options.persist, signal: options.signal });
}

function isLegacyInput(input: ProductIdentificationInput | LegacyIdentificationInput): input is LegacyIdentificationInput {
  const first = input.images[0];
  return !first || 'ocrText' in first;
}

function embeddingToFingerprint(values: number[]): VisualFingerprint {
  return {
    hash: `native-${values.slice(0, 8).map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('')}`,
    luminance: values,
    colorHistogram: [],
    aspectRatio: 1
  };
}
