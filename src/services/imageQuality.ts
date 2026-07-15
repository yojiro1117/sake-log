import type { PhotoQualityAnalysis } from '../types';

export async function analyzePhotoQuality(blob: Blob): Promise<PhotoQualityAnalysis> {
  const bitmap = await createImageBitmap(blob);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const max = 384;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像品質を解析できません。');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = context.getImageData(0, 0, width, height);
  const luminance = new Float32Array(width * height);
  let sum = 0; let sumSquared = 0; let white = 0; let black = 0;
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4;
    const value = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
    luminance[pixel] = value; sum += value; sumSquared += value * value;
    if (value > 245) white += 1;
    if (value < 12) black += 1;
  }
  const mean = sum / luminance.length;
  const contrast = Math.sqrt(Math.max(0, sumSquared / luminance.length - mean * mean));
  let laplacianSum = 0; let laplacianSquared = 0; let count = 0;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const center = luminance[y * width + x];
    const laplacian = 4 * center - luminance[y * width + x - 1] - luminance[y * width + x + 1] - luminance[(y - 1) * width + x] - luminance[(y + 1) * width + x];
    laplacianSum += laplacian; laplacianSquared += laplacian * laplacian; count += 1;
  }
  const lapMean = laplacianSum / Math.max(1, count);
  const lapVariance = laplacianSquared / Math.max(1, count) - lapMean * lapMean;
  const blurScore = Math.max(0, Math.min(1, lapVariance / 1300));
  const brightnessScore = Math.max(0, 1 - Math.abs(mean - 132) / 132);
  const contrastScore = Math.max(0, Math.min(1, contrast / 68));
  const glareScore = Math.max(0, Math.min(1, white / luminance.length * 9));
  const warnings: string[] = [];
  const recommendedActions: string[] = [];
  if (blurScore < 0.28) { warnings.push('ブレまたはピンぼけ'); recommendedActions.push('シャープ化と2倍拡大'); }
  if (mean < 70) { warnings.push('暗い'); recommendedActions.push('ガンマ・明るさ補正'); }
  if (mean > 210) { warnings.push('明るすぎる'); recommendedActions.push('ハイライト抑制'); }
  if (contrastScore < 0.32) { warnings.push('低コントラスト'); recommendedActions.push('局所コントラスト補正'); }
  if (glareScore > 0.3) { warnings.push('反射または白飛び'); recommendedActions.push('色チャンネル分離と反射抑制'); }
  if (black / luminance.length > 0.3) { warnings.push('黒つぶれ'); recommendedActions.push('シャドウ補正'); }
  if (sourceWidth < 900 || sourceHeight < 900) { warnings.push('解像度が低い'); recommendedActions.push('2倍拡大'); }
  return { blurScore, brightnessScore, contrastScore, glareScore, width: sourceWidth, height: sourceHeight, warnings, recommendedActions: [...new Set(recommendedActions)] };
}
