import type { LabelRegion, PhotoQualityAnalysis } from '../types';

export function detectLabelRegions(quality: PhotoQualityAnalysis): LabelRegion[] {
  const portrait = quality.height >= quality.width;
  const regions: LabelRegion[] = [{
    id: 'center-label', x: portrait ? 0.12 : 0.2, y: portrait ? 0.27 : 0.18,
    width: portrait ? 0.76 : 0.6, height: portrait ? 0.56 : 0.68,
    confidence: quality.blurScore >= 0.25 ? 0.62 : 0.44, kind: 'center',
    reasons: ['ボトル写真の中央ラベル領域']
  }];
  regions.push({ id:'neck-label', x:0.28, y:0.03, width:0.44, height:0.25, confidence:0.38, kind:'neck', reasons:['首ラベル候補'] });
  regions.push({ id:'barcode-region', x:0.48, y:0.42, width:0.48, height:0.52, confidence:0.34, kind:'barcode', reasons:['裏ラベル右下のコード候補'] });
  return regions;
}

export async function detectLabelRegionsFromImage(blob: Blob, quality: PhotoQualityAnalysis): Promise<LabelRegion[]> {
  const fallback = detectLabelRegions(quality);
  try {
    const bitmap = await createImageBitmap(blob);
    const width = 192;
    const height = Math.max(96, Math.round(width * bitmap.height / bitmap.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, width, height).data;
    const columns = 6; const rows = 8; const cells: Array<{ x: number; y: number; score: number }> = [];
    for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < columns; gx += 1) {
      let edges = 0; let samples = 0;
      const startX = Math.floor(gx * width / columns); const endX = Math.floor((gx + 1) * width / columns);
      const startY = Math.floor(gy * height / rows); const endY = Math.floor((gy + 1) * height / rows);
      for (let y = Math.max(1, startY); y < endY; y += 2) for (let x = Math.max(1, startX); x < endX; x += 2) {
        const index = (y * width + x) * 4;
        edges += pixelDifference(pixels, index, index - 4) + pixelDifference(pixels, index, index - width * 4);
        samples += 2;
      }
      cells.push({ x: gx, y: gy, score: edges / Math.max(1, samples) });
    }
    const ranked = cells.sort((left, right) => right.score - left.score);
    const best = ranked.find((cell) => cell.x >= 1 && cell.x <= columns - 2 && cell.y >= 1 && cell.y <= rows - 2) ?? ranked[0];
    if (!best || best.score < 8) return fallback;
    const region: LabelRegion = {
      id: 'edge-density-label',
      x: Math.max(0.02, (best.x - 1) / columns),
      y: Math.max(0.02, (best.y - 1) / rows),
      width: Math.min(0.96, 3 / columns),
      height: Math.min(0.9, 4 / rows),
      confidence: Math.max(0.45, Math.min(0.82, best.score / 45)),
      kind: 'center',
      reasons: ['文字・輪郭密度が高い領域']
    };
    return [region, ...fallback.filter((item) => item.kind !== 'center')];
  } catch {
    return fallback;
  }
}

export async function cropRegion(blob: Blob, region: LabelRegion, rotateDegrees = 0): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const sx = Math.round(region.x * bitmap.width); const sy = Math.round(region.y * bitmap.height);
  const sw = Math.max(1, Math.round(region.width * bitmap.width)); const sh = Math.max(1, Math.round(region.height * bitmap.height));
  const quarterTurn = Math.abs(rotateDegrees) % 180 === 90;
  const canvas = new OffscreenCanvas(quarterTurn ? sh : sw, quarterTurn ? sw : sh);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('ラベル範囲を切り出せません。');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotateDegrees * Math.PI / 180);
  context.drawImage(bitmap, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  bitmap.close();
  return canvas.convertToBlob({ type:'image/jpeg', quality:0.9 });
}

function pixelDifference(data: Uint8ClampedArray, left: number, right: number) {
  return Math.abs(data[left] - data[right]) + Math.abs(data[left + 1] - data[right + 1]) + Math.abs(data[left + 2] - data[right + 2]);
}
