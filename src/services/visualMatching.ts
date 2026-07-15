import type { ProductReferenceImage, VisualFingerprint } from '../types';

export async function createVisualFingerprint(blob: Blob): Promise<VisualFingerprint> {
  const bitmap = await createImageBitmap(blob);
  const aspectRatio = bitmap.width / bitmap.height;
  const canvas = new OffscreenCanvas(17, 16);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('視覚特徴を生成できません。');
  context.drawImage(bitmap, 0, 0, 17, 16);
  const { data } = context.getImageData(0, 0, 17, 16);
  const fingerprint = createVisualFingerprintFromRgba(data, aspectRatio);
  bitmap.close();
  return fingerprint;
}

export function createVisualFingerprintFromRgba(data: ArrayLike<number>, aspectRatio: number): VisualFingerprint {
  const luminance: number[] = []; const histogram = Array.from({ length: 24 }, () => 0);
  for (let pixel = 0; pixel < 17 * 16; pixel += 1) {
    const offset = pixel * 4; const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
    luminance.push(Math.round(r * 0.299 + g * 0.587 + b * 0.114));
    histogram[Math.min(7, Math.floor(r / 32))] += 1;
    histogram[8 + Math.min(7, Math.floor(g / 32))] += 1;
    histogram[16 + Math.min(7, Math.floor(b / 32))] += 1;
  }
  let bits = '';
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) bits += luminance[y * 17 + x] > luminance[y * 17 + x + 1] ? '1' : '0';
  const hash = Array.from({ length: 64 }, (_, index) => Number.parseInt(bits.slice(index * 4, index * 4 + 4), 2).toString(16)).join('');
  return { hash, luminance: luminance.filter((_, index) => index % 17 !== 16), colorHistogram: histogram.map((value) => value / (17 * 16)), aspectRatio };
}

export function visualSimilarity(left: VisualFingerprint, right: VisualFingerprint) {
  let differingBits = 0;
  for (let index = 0; index < Math.min(left.hash.length, right.hash.length); index += 1) {
    let xor = Number.parseInt(left.hash[index], 16) ^ Number.parseInt(right.hash[index], 16);
    while (xor) { differingBits += xor & 1; xor >>= 1; }
  }
  const hashScore = 1 - differingBits / 256;
  const histogramDistance = left.colorHistogram.reduce((sum, value, index) => sum + Math.abs(value - (right.colorHistogram[index] ?? 0)), 0) / 6;
  const aspectPenalty = Math.min(0.2, Math.abs(Math.log(Math.max(0.01, left.aspectRatio / right.aspectRatio))) * 0.12);
  return Math.max(0, Math.min(1, hashScore * 0.74 + (1 - histogramDistance) * 0.26 - aspectPenalty));
}

export function scoreVisualReferences(fingerprint: VisualFingerprint, references: ProductReferenceImage[]) {
  const result: Record<string, number> = {};
  for (const reference of references.filter((item) => item.userConfirmed)) result[reference.productId] = Math.max(result[reference.productId] ?? 0, visualSimilarity(fingerprint, reference.fingerprint));
  return result;
}
