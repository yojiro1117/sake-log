import type { ClassificationCorrection, ImageType, PhotoClassification, VisualImageFeatures } from '../types';

const KEYWORDS: Record<ImageType, string[]> = {
  frontLabel: [],
  backLabel: ['原材料', 'アルコール分', '内容量', '製造者', '注意', '品目', 'barcode'],
  bottle: [],
  glass: [],
  food: ['料理', 'お品書き', 'メニュー'],
  receipt: ['合計', '税込', '小計', '領収', 'レシート', 'tel', '現計'],
  other: []
};

export function classifyPhoto(input: {
  ocrText: string;
  width?: number;
  height?: number;
  knownCandidateCount?: number;
  ocrConfidence?: number;
  corrections?: ClassificationCorrection[];
  visualFeatures?: VisualImageFeatures;
}): PhotoClassification {
  const text = input.ocrText.normalize('NFKC').toLowerCase();
  const ratio = (input.height ?? 1) / Math.max(input.width ?? 1, 1);
  const scores: Record<ImageType, number> = { frontLabel: 8, backLabel: 4, bottle: 18, glass: 2, food: 2, receipt: 2, other: 6 };
  const reasons: Partial<Record<ImageType, string[]>> = {};

  for (const type of Object.keys(KEYWORDS) as ImageType[]) {
    for (const keyword of KEYWORDS[type]) {
      if (text.includes(keyword)) {
        scores[type] += type === 'receipt' ? 22 : 15;
        (reasons[type] ??= []).push(`「${keyword}」を検出`);
      }
    }
  }
  const backKeywordCount = KEYWORDS.backLabel.filter((keyword) => text.includes(keyword)).length;
  if (backKeywordCount >= 2) {
    scores.backLabel += 28;
    (reasons.backLabel ??= []).push('裏ラベル固有語が複数ある');
  }
  if (text.length > 320 && (input.ocrConfidence ?? 0) >= 0.35) {
    scores.backLabel += 30;
    (reasons.backLabel ??= []).push('高密度の説明文を検出');
  }
  if (text.length < 60 && (input.knownCandidateCount ?? 0) > 0) {
    scores.frontLabel += 30;
    (reasons.frontLabel ??= []).push('銘柄候補と少量の文字を検出');
  }
  if (ratio > 1.25) {
    scores.bottle += text.length < 100 ? 18 : 8;
    (reasons.bottle ??= []).push('縦長の画像構成');
  }
  if (!text.trim()) {
    scores.other += 20;
    (reasons.other ??= []).push('判定できる文字情報がない');
  }
  if (input.visualFeatures) {
    const { edgeSpread, outerEdgeDensity } = input.visualFeatures;
    if (input.visualFeatures.centerEdgeDensity < 0.05 || edgeSpread < 0.62) {
      scores.frontLabel += 24;
      (reasons.frontLabel ??= []).push('ラベル接写に近い輪郭分布');
    } else if (outerEdgeDensity < 0.035) {
      scores.bottle += 8;
      (reasons.bottle ??= []).push('外周の輪郭が少ない');
    }
  }

  for (const correction of input.corrections ?? []) {
    if (correction.fingerprint && text.includes(correction.fingerprint)) {
      scores[correction.correctedType] += Math.min(25, correction.acceptedCount * 5);
      (reasons[correction.correctedType] ??= []).push('過去の分類修正');
    }
  }

  const ranked = (Object.entries(scores) as Array<[ImageType, number]>).sort((a, b) => b[1] - a[1]);
  const sum = ranked.reduce((total, [, score]) => total + score, 0);
  const alternatives = ranked.slice(0, 3).map(([type, score]) => ({ type, confidence: Math.round((score / sum) * 100) }));
  const [type, topScore] = ranked[0];
  const rawConfidence = Math.round((topScore / Math.max(ranked[1][1], 1)) * 55);
  const receiptKeywordCount = KEYWORDS.receipt.filter((keyword) => text.includes(keyword)).length;
  const strongEvidence = backKeywordCount >= 2 || receiptKeywordCount >= 2 || (reasons[type] ?? []).includes('過去の分類修正');
  const confidence = Math.min(strongEvidence ? 96 : type === 'bottle' ? 72 : 84, rawConfidence);
  return {
    type,
    confidence,
    reasons: reasons[type] ?? ['画像比率と文字量から推定'],
    alternatives,
    requiresConfirmation: confidence < 90
  };
}

export async function extractVisualImageFeatures(blob: Blob): Promise<VisualImageFeatures | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, 64, 64);
    bitmap.close?.();
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let center = 0;
    let centerCount = 0;
    let outer = 0;
    let outerCount = 0;
    const gray = (index: number) => pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    for (let y = 1; y < 63; y += 1) {
      for (let x = 1; x < 63; x += 1) {
        const index = (y * 64 + x) * 4;
        const gradient = (Math.abs(gray(index) - gray(index - 4)) + Math.abs(gray(index) - gray(index - 64 * 4))) / 510;
        const isCenter = x >= 16 && x < 48 && y >= 8 && y < 56;
        if (isCenter) { center += gradient; centerCount += 1; }
        else { outer += gradient; outerCount += 1; }
      }
    }
    const centerEdgeDensity = center / Math.max(centerCount, 1);
    const outerEdgeDensity = outer / Math.max(outerCount, 1);
    return { centerEdgeDensity, outerEdgeDensity, edgeSpread: outerEdgeDensity / Math.max(centerEdgeDensity, 0.0001) };
  } catch {
    return undefined;
  }
}
