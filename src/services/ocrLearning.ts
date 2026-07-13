import { db } from '../db/db';
import type { AlcoholType, CandidateMatch, ImageType, OcrCorrectionEntry } from '../types';

export async function recordOcrCorrection(input: {
  observedText: string;
  productName: string;
  makerName?: string;
  alcoholType?: AlcoholType;
}) {
  const observedText = input.observedText.trim().slice(0, 200);
  if (!observedText || !input.productName.trim()) return;
  const existing = await db.ocrCorrections.where('observedText').equals(observedText).first();
  const now = new Date().toISOString();
  const entry: OcrCorrectionEntry = existing
    ? {
        ...existing,
        correctedProductName: input.productName.trim(),
        correctedMakerName: input.makerName?.trim(),
        correctedAlcoholType: input.alcoholType,
        aliases: [...new Set([...(existing.aliases ?? []), ...extractObservedAliases(input.observedText)])].slice(0, 12),
        occurrenceCount: existing.occurrenceCount + 1,
        acceptedCount: existing.acceptedCount + 1,
        confidenceAdjustment: Math.min(15, existing.confidenceAdjustment + 2),
        lastUsedAt: now
      }
    : {
        id: crypto.randomUUID(),
        observedText,
        correctedProductName: input.productName.trim(),
        correctedMakerName: input.makerName?.trim(),
        correctedAlcoholType: input.alcoholType,
        aliases: extractObservedAliases(input.observedText),
        occurrenceCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        lastUsedAt: now,
        createdAt: now,
        confidenceAdjustment: 2
      };
  await db.ocrCorrections.put(entry);
}

export async function learningCandidates(ocrText: string): Promise<CandidateMatch[]> {
  const normalized = ocrText.normalize('NFKC').toLowerCase();
  const entries = await db.ocrCorrections.toArray();
  return entries
    .filter((entry) => [entry.observedText, ...(entry.aliases ?? [])].some((value) => normalized.includes(value.normalize('NFKC').toLowerCase())))
    .sort((a, b) => b.acceptedCount - b.rejectedCount - (a.acceptedCount - a.rejectedCount))
    .map((entry) => ({
      productName: entry.correctedProductName,
      makerName: entry.correctedMakerName,
      alcoholType: entry.correctedAlcoholType,
      confidence: entry.acceptedCount >= 3 ? 'high' : 'medium',
      totalConfidence: Math.min(92, 65 + entry.confidenceAdjustment),
      matchReasons: ['過去の修正履歴'],
      mismatchReasons: [],
      requiresConfirmation: true
    }));
}

function extractObservedAliases(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.normalize('NFKC').trim())
    .filter((line) => line.length >= 2 && line.length <= 40 && /[A-Za-z0-9一-龠ぁ-んァ-ン]/.test(line))
    .slice(0, 10);
}

export async function recordClassificationCorrection(fingerprint: string, suggestedType: ImageType, correctedType: ImageType) {
  if (!fingerprint || suggestedType === correctedType) return;
  const existing = await db.classificationCorrections.where('fingerprint').equals(fingerprint).first();
  await db.classificationCorrections.put({
    id: existing?.id ?? crypto.randomUUID(),
    fingerprint,
    suggestedType,
    correctedType,
    acceptedCount: (existing?.acceptedCount ?? 0) + 1,
    rejectedCount: existing?.rejectedCount ?? 0,
    updatedAt: new Date().toISOString()
  });
}
