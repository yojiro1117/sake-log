import type { NativeLabelRegion } from '../platform/visionTypes';

export function selectOcrRegions(regions: NativeLabelRegion[]) {
  return [...regions]
    .filter((region) => region.boundingBox.width * region.boundingBox.height >= 0.04)
    .sort((a, b) => regionPriority(a.regionType) - regionPriority(b.regionType) || b.confidence - a.confidence)
    .slice(0, 4);
}

function regionPriority(type: NativeLabelRegion['regionType']) {
  return { frontLabel: 0, backLabel: 1, neckLabel: 2, barcode: 3, fullImage: 4 }[type];
}
