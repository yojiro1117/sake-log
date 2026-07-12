import { fileToResizedBlob } from './imageService';
import type { ImportedPhotoDraft, PhotoImportCandidate } from '../types';

type DetectedText = { rawValue?: string };
type TextDetectorCtor = new () => { detect: (source: ImageBitmapSource) => Promise<DetectedText[]> };

const knownLabels = [
  '獺祭',
  '十四代',
  '新政',
  '而今',
  '田酒',
  '黒龍',
  '飛露喜',
  '写楽',
  '久保田',
  '八海山',
  '鍋島',
  '仙禽',
  '山崎',
  '白州',
  '響',
  '角',
  'いいちこ',
  '黒霧島',
  '赤霧島',
  '一番搾り',
  '黒ラベル',
  'プレミアムモルツ',
  'よなよなエール'
];

export async function createImportedPhotoDrafts(files: File[]): Promise<ImportedPhotoDraft[]> {
  const drafts: ImportedPhotoDraft[] = [];
  for (const file of files) {
    const [resizedBlob, takenAt, ocrText] = await Promise.all([
      fileToResizedBlob(file),
      readExifTakenDate(file),
      readImageText(file)
    ]);
    drafts.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      originalFile: file,
      resizedBlob,
      previewUrl: URL.createObjectURL(resizedBlob),
      takenAt,
      ocrText,
      candidates: buildCandidates(ocrText)
    });
  }
  return drafts;
}

export async function readExifTakenDate(file: File): Promise<string | undefined> {
  const view = new DataView(await file.arrayBuffer());
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && readAscii(view, offset + 4, 6) === 'Exif\0\0') {
      return readExifDateFromTiff(view, offset + 10);
    }
    offset += 2 + size;
  }
  return undefined;
}

async function readImageText(file: File): Promise<string | undefined> {
  const Detector = (globalThis as unknown as { TextDetector?: TextDetectorCtor }).TextDetector;
  if (!Detector) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new Detector();
    const results = await detector.detect(bitmap);
    return results.map((result) => result.rawValue).filter(Boolean).join('\n') || undefined;
  } catch {
    return undefined;
  }
}

function readExifDateFromTiff(view: DataView, tiffStart: number) {
  const endian = readAscii(view, tiffStart, 2);
  const little = endian === 'II';
  const firstIfdOffset = readUint32(view, tiffStart + 4, little);
  const firstIfd = tiffStart + firstIfdOffset;
  const dateTime = readIfdAsciiTag(view, tiffStart, firstIfd, 0x0132, little);
  const exifIfdOffset = readIfdLongTag(view, firstIfd, 0x8769, little);
  const original = exifIfdOffset ? readIfdAsciiTag(view, tiffStart, tiffStart + exifIfdOffset, 0x9003, little) : undefined;
  return normalizeExifDate(original ?? dateTime);
}

function readIfdAsciiTag(view: DataView, tiffStart: number, ifdOffset: number, tag: number, little: boolean) {
  const entryCount = readUint16(view, ifdOffset, little);
  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (readUint16(view, entry, little) !== tag) continue;
    const type = readUint16(view, entry + 2, little);
    const count = readUint32(view, entry + 4, little);
    if (type !== 2 || count <= 0) return undefined;
    const valueOffset = count <= 4 ? entry + 8 : tiffStart + readUint32(view, entry + 8, little);
    return readAscii(view, valueOffset, count).replace(/\0/g, '').trim();
  }
  return undefined;
}

function readIfdLongTag(view: DataView, ifdOffset: number, tag: number, little: boolean) {
  const entryCount = readUint16(view, ifdOffset, little);
  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (readUint16(view, entry, little) === tag) return readUint32(view, entry + 8, little);
  }
  return undefined;
}

function buildCandidates(ocrText?: string): PhotoImportCandidate[] {
  const text = ocrText ?? '';
  const candidates: PhotoImportCandidate[] = [];
  const volume = extractNumber(text, /(\d{3,4})\s?m[lL]/);
  const abv = extractNumber(text, /(?:alc|alcohol|度数|アルコール)[^\d]*(\d{1,2}(?:\.\d)?)/i);

  knownLabels.forEach((label) => {
    if (text.includes(label)) {
      candidates.push({ productName: label, volume, abv, confidence: 'high', reason: 'ラベル文字から候補を作成しました。' });
    }
  });

  if (candidates.length === 0 && text.trim()) {
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 2 && line.length <= 20);
    if (firstLine) candidates.push({ productName: firstLine, volume, abv, confidence: 'medium', reason: '読み取れた文字から候補を作成しました。' });
  }

  if (candidates.length === 0) {
    knownLabels.slice(0, 5).forEach((label) => {
      candidates.push({ productName: label, confidence: 'low', reason: '画像のみでは特定できないため、代表的な候補を表示しています。' });
    });
  }

  return candidates.slice(0, 6);
}

function extractNumber(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : undefined;
}

function normalizeExifDate(value?: string) {
  const match = value?.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

function readAscii(view: DataView, offset: number, length: number) {
  let result = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
    result += String.fromCharCode(view.getUint8(offset + i));
  }
  return result;
}

function readUint16(view: DataView, offset: number, little: boolean) {
  return view.getUint16(offset, little);
}

function readUint32(view: DataView, offset: number, little: boolean) {
  return view.getUint32(offset, little);
}
