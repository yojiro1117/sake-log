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
