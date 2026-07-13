export type OcrVariantKind =
  | 'original'
  | 'orientation'
  | 'centerCrop'
  | 'upscaleGray'
  | 'contrast'
  | 'threshold'
  | 'sharpen';

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

export async function createOcrVariants(file: Blob): Promise<OcrVariant[]> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const variants: OcrVariant[] = [
      { kind: 'original', label: '元画像', blob: file },
      { kind: 'orientation', label: 'EXIF Orientation補正', blob: await renderVariant(bitmap, { scale: 1, mode: 'normal' }) },
      { kind: 'centerCrop', label: 'ラベル領域中央切り出し', blob: await renderVariant(bitmap, { scale: 1.8, mode: 'crop' }) },
      { kind: 'upscaleGray', label: '拡大＋グレースケール', blob: await renderVariant(bitmap, { scale: 2, mode: 'gray' }) },
      { kind: 'contrast', label: 'コントラスト補正', blob: await renderVariant(bitmap, { scale: 2, mode: 'contrast' }) },
      { kind: 'threshold', label: '二値化', blob: await renderVariant(bitmap, { scale: 2, mode: 'threshold' }) },
      { kind: 'sharpen', label: 'シャープ化', blob: await renderVariant(bitmap, { scale: 2, mode: 'sharpen' }) }
    ];
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
  options: { scale: number; mode: 'normal' | 'crop' | 'gray' | 'contrast' | 'threshold' | 'sharpen' }
) {
  const source = cropSource(bitmap, options.mode === 'crop');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * options.scale));
  canvas.height = Math.max(1, Math.round(source.height * options.scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OCR前処理用Canvasを初期化できませんでした。');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);

  if (options.mode !== 'normal' && options.mode !== 'crop') {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (options.mode === 'gray') toGray(image.data);
    if (options.mode === 'contrast') adjustContrast(image.data, 42, 12);
    if (options.mode === 'threshold') threshold(image.data);
    if (options.mode === 'sharpen') sharpen(image, canvas.width, canvas.height);
    ctx.putImageData(image, 0, 0);
  }

  return canvasToBlob(canvas);
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
