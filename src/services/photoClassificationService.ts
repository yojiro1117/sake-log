export { classifyPhoto, extractVisualImageFeatures } from './photoClassification';
import type { IdentificationPhotoType, VisualImageFeatures } from '../types';

export function classifyIdentificationPhoto(input: {
  baseType: IdentificationPhotoType;
  baseConfidence: number;
  ocrText: string;
  barcodeValues?: string[];
  width?: number;
  height?: number;
  visualFeatures?: VisualImageFeatures;
}): { type: IdentificationPhotoType; confidence: number; reasons: string[] } {
  const text = input.ocrText.normalize('NFKC').toLowerCase();
  if (input.barcodeValues?.length) return { type:'barcode', confidence:96, reasons:['有効なJAN/EANを検出'] };
  if (/合計|税込|小計|領収|レシート|¥|￥/.test(text)) return { type:'receipt', confidence:90, reasons:['価格・会計語を検出'] };
  if (/原材料|内容量|製造者|アルコール分/.test(text)) return { type:'backLabel', confidence:88, reasons:['裏ラベル固有語を検出'] };
  const ratio = (input.height ?? 1) / Math.max(1, input.width ?? 1);
  if (ratio > 2.2 && text.length < 40) return { type:'neckLabel', confidence:58, reasons:['細長いラベル構成'] };
  if ((input.visualFeatures?.edgeSpread ?? 0) > 1.25 && text.length > 150) return { type:'shelf', confidence:54, reasons:['画面全体に文字・輪郭が分散'] };
  if ((input.visualFeatures?.outerEdgeDensity ?? 0) > 0.09 && ratio < 1.4) return { type:'multipleBottles', confidence:51, reasons:['外周に複数の強い輪郭'] };
  if (input.baseConfidence < 40) return { type:'unknown', confidence:100 - input.baseConfidence, reasons:['分類根拠が不足'] };
  return { type:input.baseType, confidence:input.baseConfidence, reasons:['文字・比率・輪郭の複合判定'] };
}
