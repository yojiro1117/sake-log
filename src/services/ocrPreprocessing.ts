export type OcrVariantKind =
  | 'original'
  | 'orientation'
  | 'centerCrop'
  | 'upscaleGray'
  | 'contrast'
  | 'threshold'
  | 'sharpen'
  | 'gamma'
  | 'adaptiveThreshold'
  | 'rotate90';

export interface OcrVariant {
  kind: OcrVariantKind;
  label: string;
  blob: Blob;
}

export interface OcrVariantScoreInput {
  text: string;
  confidence: number;
  candidateCount: number;
  variantKind: OcrVariantKind;
}

export async function createOcrVariants(file: Blob, quality?: { blurScore: number; brightnessScore: number; contrastScore: number; warnings: string[] }): Promise<OcrVariant[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const variants: OcrVariant[] = [
      { kind: 'original', label: '元画像', blob: file },
      { kind: 'orientation', label: 'EXIF Orientation補正', blob: await renderVariant(bitmap, { scale: 1, mode: 'normal' }) },
      { kind: 'centerCrop', label: 'ラベル領域中央切り出し', blob: await renderVariant(bitmap, { scale: 1.8, mode: 'crop' }) }
    ];
    if (!quality || quality.contrastScore < 0.55) variants.push({ kind: 'contrast', label: 'コントラスト補正', blob: await renderVariant(bitmap, { scale: 2, mode: 'contrast' }) });
    if (!quality || quality.blurScore < 0.4) variants.push({ kind: 'sharpen', label: '拡大＋シャープ化', blob: await renderVariant(bitmap, { scale: 2, mode: 'sharpen' }) });
    if (!quality || quality.brightnessScore < 0.55) variants.push({ kind: 'gamma', label: 'ガンマ・明るさ補正', blob: await renderVariant(bitmap, { scale: 2, mode: 'gamma' }) });
    if (!quality || quality.contrastScore < 0.35) variants.push({ kind: 'adaptiveThreshold', label: '適応的二値化', blob: await renderVariant(bitmap, { scale: 2, mode: 'adaptiveThreshold' }) });
    if (!quality) variants.push({ kind: 'upscaleGray', label: '拡大＋グレースケール', blob: await renderVariant(bitmap, { scale: 2, mode: 'gray' }) });
    if (!quality) variants.push({ kind: 'threshold', label: '大津相当二値化', blob: await renderVariant(bitmap, { scale: 2, mode: 'threshold' }) });
    if (bitmap.height > bitmap.width * 1.25) variants.push({ kind: 'rotate90', label: '縦書き向け90度回転', blob: await renderVariant(bitmap, { scale: 1.5, mode: 'rotate90' }) });
    return variants;
  } finally {
    bitmap.close?.();
  }
}

export function scoreOcrVariant(input: OcrVariantScoreInput) {
  const normalizedLength = input.text.replace(/\s/g, '').length;
  const textScore = Math.min(35, normalizedLength * 1.6);
  const candidateScore = input.candidateCount * 18;
  const confidenceScore = input.confidence * 45;
  const variantBonus = input.variantKind === 'centerCrop' || input.variantKind === 'contrast' ? 4 : 0;
  return confidenceScore + textScore + candidateScore + variantBonus;
}

async function renderVariant(
  bitmap: ImageBitmap,
  options: { scale: number; mode: 'normal' | 'crop' | 'gray' | 'contrast' | 'threshold' | 'sharpen' | 'gamma' | 'adaptiveThreshold' | 'rotate90' }
) {
  const source = cropSource(bitmap, options.mode === 'crop');
  const canvas = document.createElement('canvas');
  const rotated = options.mode === 'rotate90';
  canvas.width = Math.max(1, Math.round((rotated ? source.height : source.width) * options.scale));
  canvas.height = Math.max(1, Math.round((rotated ? source.width : source.height) * options.scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OCR前処理用Canvasを初期化できませんでした。');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (rotated) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bitmap, source.x, source.y, source.width, source.height, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else ctx.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);

  if (options.mode !== 'normal' && options.mode !== 'crop') {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (options.mode === 'gray') toGray(image.data);
    if (options.mode === 'contrast') adjustContrast(image.data, 42, 12);
    if (options.mode === 'threshold') threshold(image.data);
    if (options.mode === 'sharpen') sharpen(image, canvas.width, canvas.height);
    if (options.mode === 'gamma') adjustGamma(image.data, 0.72, 18);
    if (options.mode === 'adaptiveThreshold') adaptiveThreshold(image, canvas.width, canvas.height);
    ctx.putImageData(image, 0, 0);
  }

  return canvasToBlob(canvas);
}

function adjustGamma(data: Uint8ClampedArray, gamma: number, brightness: number) {
  const inverse = 1 / gamma;
  for (let index = 0; index < data.length; index += 4) for (let channel = 0; channel < 3; channel += 1) {
    data[index + channel] = clamp(255 * ((data[index + channel] + brightness) / 255) ** inverse);
  }
}

function adaptiveThreshold(image: ImageData, width: number, height: number) {
  toGray(image.data);
  const source = new Uint8ClampedArray(image.data);
  const radius = Math.max(4, Math.round(Math.min(width, height) / 80));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0; let count = 0;
    for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(height - 1, y + radius); sampleY += radius) {
      for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += radius) {
        sum += source[(sampleY * width + sampleX) * 4]; count += 1;
      }
    }
    const offset = (y * width + x) * 4; const value = source[offset] > sum / count - 9 ? 255 : 0;
    image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value;
  }
}

function cropSource(bitmap: ImageBitmap, crop: boolean) {
  if (!crop) return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const width = Math.round(bitmap.width * 0.78);
  const height = Math.round(bitmap.height * 0.58);
  return {
    x: Math.round((bitmap.width - width) / 2),
    y: Math.round((bitmap.height - height) / 2),
    width,
    height
  };
}

function toGray(data: Uint8ClampedArray) {
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
}

function adjustContrast(data: Uint8ClampedArray, contrast: number, brightness: number) {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = clamp(factor * (data[index + channel] - 128) + 128 + brightness);
    }
  }
}

function threshold(data: Uint8ClampedArray) {
  toGray(data);
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) sum += data[index];
  const average = sum / (data.length / 4);
  for (let index = 0; index < data.length; index += 4) {
    const value = data[index] > average - 10 ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
}

function sharpen(image: ImageData, width: number, height: number) {
  const copy = new Uint8ClampedArray(image.data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          copy[offset + channel] * 5 -
          copy[offset - 4 + channel] -
          copy[offset + 4 + channel] -
          copy[offset - width * 4 + channel] -
          copy[offset + width * 4 + channel];
        image.data[offset + channel] = clamp(value);
      }
    }
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('OCR前処理画像の生成に失敗しました。'));
    }, 'image/png', 0.96);
  });
}
