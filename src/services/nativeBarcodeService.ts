import type { NativeBarcodeObservation } from '../platform/visionTypes';

export function uniqueProductBarcodes(observations: NativeBarcodeObservation[]) {
  return [...new Map(observations
    .filter((item) => /^\d{8}$|^\d{12,13}$|^[\w.-]{4,}$/u.test(item.rawValue.trim()))
    .map((item) => [item.rawValue.trim(), item] as const)).values()]
    .sort((a, b) => b.confidence - a.confidence);
}
