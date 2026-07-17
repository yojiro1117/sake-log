import type { ProductReferenceImage, VisualFingerprint } from '../types';

export const WEB_VISUAL_MODEL = 'sake-local-label-composite';
export const WEB_VISUAL_VERSION = '2';

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
  const body = luminance.filter((_, index) => index % 17 !== 16);
  const mean = body.reduce((sum, value) => sum + value, 0) / body.length;
  const averageBits = body.map((value) => value >= mean ? '1' : '0').join('');
  const averageHash = bitsToHex(averageBits);
  const perceptualHash = bitsToHex(body.map((value, index) => value >= localMean(body, index, 16) ? '1' : '0').join(''));
  const edgeHistogram = createEdgeHistogram(body, 16, 16);
  const layoutSignature = createLayoutSignature(body, 16, 16);
  const dominantColors = dominantHistogramColors(histogram);
  return {
    embeddingModel: WEB_VISUAL_MODEL,
    embeddingVersion: WEB_VISUAL_VERSION,
    hash, averageHash, perceptualHash, luminance: body,
    colorHistogram: histogram.map((value) => value / (17 * 16)), edgeHistogram, layoutSignature, dominantColors, aspectRatio
  };
}

export function visualSimilarity(left: VisualFingerprint, right: VisualFingerprint) {
  if (!areVisualModelsCompatible(left, right)) return 0;
  let differingBits = 0;
  for (let index = 0; index < Math.min(left.hash.length, right.hash.length); index += 1) {
    let xor = Number.parseInt(left.hash[index], 16) ^ Number.parseInt(right.hash[index], 16);
    while (xor) { differingBits += xor & 1; xor >>= 1; }
  }
  const hashScore = 1 - differingBits / 256;
  const averageScore = hexSimilarity(left.averageHash, right.averageHash);
  const perceptualScore = hexSimilarity(left.perceptualHash, right.perceptualHash);
  const histogramDistance = left.colorHistogram.reduce((sum, value, index) => sum + Math.abs(value - (right.colorHistogram[index] ?? 0)), 0) / 6;
  const edgeDistance = vectorDistance(left.edgeHistogram, right.edgeHistogram);
  const layoutDistance = vectorDistance(left.layoutSignature, right.layoutSignature);
  const aspectPenalty = Math.min(0.2, Math.abs(Math.log(Math.max(0.01, left.aspectRatio / right.aspectRatio))) * 0.12);
  const hasCompositeFeatures = Boolean(left.averageHash && right.averageHash && left.perceptualHash && right.perceptualHash);
  const score = hasCompositeFeatures
    ? hashScore * 0.34 + averageScore * 0.12 + perceptualScore * 0.18 + (1 - histogramDistance) * 0.16 +
      (1 - edgeDistance) * 0.12 + (1 - layoutDistance) * 0.08
    : hashScore * 0.74 + (1 - histogramDistance) * 0.26;
  return Math.max(0, Math.min(1, score - aspectPenalty));
}

export function scoreVisualReferences(fingerprint: VisualFingerprint, references: ProductReferenceImage[]) {
  const result: Record<string, number> = {};
  for (const reference of references.filter((item) => item.userConfirmed && areVisualModelsCompatible(fingerprint, item.fingerprint))) {
    result[reference.productId] = Math.max(result[reference.productId] ?? 0, visualSimilarity(fingerprint, reference.fingerprint));
  }
  return result;
}

export function exactImageReferenceProducts(imageHash: string, references: ProductReferenceImage[]) {
  return [...new Set(references.filter((item) => item.userConfirmed && item.imageHash === imageHash).map((item) => item.productId))];
}

export function areVisualModelsCompatible(left: VisualFingerprint, right: VisualFingerprint) {
  const leftModel = left.embeddingModel ?? WEB_VISUAL_MODEL;
  const rightModel = right.embeddingModel ?? WEB_VISUAL_MODEL;
  const leftVersion = left.embeddingVersion ?? WEB_VISUAL_VERSION;
  const rightVersion = right.embeddingVersion ?? WEB_VISUAL_VERSION;
  return leftModel === rightModel && leftVersion === rightVersion;
}

function bitsToHex(bits: string) {
  return Array.from({ length: Math.ceil(bits.length / 4) }, (_, index) => Number.parseInt(bits.slice(index * 4, index * 4 + 4).padEnd(4, '0'), 2).toString(16)).join('');
}

function localMean(values: number[], index: number, width: number) {
  const x = index % width; const y = Math.floor(index / width); let sum = 0; let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < Math.ceil(values.length / width)) { sum += values[ny * width + nx] ?? values[index]; count += 1; }
  }
  return sum / Math.max(1, count);
}

function createEdgeHistogram(values: number[], width: number, height: number) {
  const bins = Array.from({ length: 8 }, () => 0);
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const gx = values[y * width + x + 1] - values[y * width + x - 1];
    const gy = values[(y + 1) * width + x] - values[(y - 1) * width + x];
    const angle = (Math.atan2(gy, gx) + Math.PI) / (2 * Math.PI);
    bins[Math.min(7, Math.floor(angle * 8))] += Math.hypot(gx, gy);
  }
  const total = bins.reduce((sum, value) => sum + value, 0) || 1;
  return bins.map((value) => value / total);
}

function createLayoutSignature(values: number[], width: number, height: number) {
  const signature: number[] = [];
  for (let gy = 0; gy < 4; gy += 1) for (let gx = 0; gx < 4; gx += 1) {
    let sum = 0; let count = 0;
    for (let y = gy * height / 4; y < (gy + 1) * height / 4; y += 1) for (let x = gx * width / 4; x < (gx + 1) * width / 4; x += 1) { sum += values[Math.floor(y) * width + Math.floor(x)] ?? 0; count += 1; }
    signature.push(sum / Math.max(1, count) / 255);
  }
  return signature;
}

function dominantHistogramColors(histogram: number[]) {
  const channels = ['R', 'G', 'B'];
  return channels.map((channel, channelIndex) => {
    const slice = histogram.slice(channelIndex * 8, channelIndex * 8 + 8);
    const bin = slice.indexOf(Math.max(...slice));
    return `${channel}${bin}`;
  });
}

function hexSimilarity(left?: string, right?: string) {
  if (!left || !right) return 0.5;
  let differing = 0; let bits = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    let xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16); bits += 4;
    while (xor) { differing += xor & 1; xor >>= 1; }
  }
  return bits ? 1 - differing / bits : 0;
}

function vectorDistance(left?: number[], right?: number[]) {
  if (!left?.length || !right?.length) return 0.5;
  return left.reduce((sum, value, index) => sum + Math.abs(value - (right[index] ?? 0)), 0) / left.length;
}
