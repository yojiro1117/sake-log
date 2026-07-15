import { db } from '../db/db';
import type { AlcoholType, CandidateMatch, ImageType, OcrCorrectionEntry } from '../types';

export async function recordOcrCorrection(input: {
  observedText: string;
  productName: string;
  makerName?: string;
  alcoholType?: AlcoholType;
  learningEventId: string;
}) {
  const observedText = selectCorrectionPhrase(input.observedText, input.productName, input.makerName);
  if (!observedText || !input.productName.trim()) return;
  const alreadyRecorded = await db.ocrCorrections.filter((entry) => entry.learningEventIds?.includes(input.learningEventId) ?? false).first();
  if (alreadyRecorded) return alreadyRecorded;
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
        lastUsedAt: now,
        learningEventIds: [...(existing.learningEventIds ?? []), input.learningEventId]
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
        confidenceAdjustment: 2,
        learningEventIds: [input.learningEventId]
      };
  await db.ocrCorrections.put(entry);
  return entry;
}

export function selectCorrectionPhrase(value:string, productName:string, makerName?:string) {
  const normalize = (text:string) => text.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();
  const targets = [productName, makerName ?? ''].map(normalize).filter((item) => item.length >= 2);
  const phrases = extractObservedAliases(value);
  return phrases
    .map((phrase) => {
      const normalized = normalize(phrase);
      const score = Math.max(0, ...targets.map((target) => normalized.includes(target) || target.includes(normalized)
        ? 100
        : [...new Set(normalized)].filter((character) => target.includes(character)).length / Math.max(target.length, normalized.length) * 100));
      return { phrase, score };
    })
    .filter((item) => item.score >= 45)
    .sort((left, right) => right.score - left.score || left.phrase.length - right.phrase.length)[0]?.phrase;
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

export async function recordClassificationCorrection(fingerprint: string, suggestedType: ImageType, correctedType: ImageType, learningEventId: string) {
  if (!fingerprint || suggestedType === correctedType) return;
  const alreadyRecorded = await db.classificationCorrections.filter((entry) => entry.learningEventIds?.includes(learningEventId) ?? false).first();
  if (alreadyRecorded) return alreadyRecorded;
  const existing = await db.classificationCorrections.where('fingerprint').equals(fingerprint).first();
  const entry = {
    id: existing?.id ?? crypto.randomUUID(),
    fingerprint,
    suggestedType,
    correctedType,
    acceptedCount: (existing?.acceptedCount ?? 0) + 1,
    rejectedCount: existing?.rejectedCount ?? 0,
    updatedAt: new Date().toISOString(),
    learningEventIds: [...(existing?.learningEventIds ?? []), learningEventId]
  };
  await db.classificationCorrections.put(entry);
  return entry;
}
