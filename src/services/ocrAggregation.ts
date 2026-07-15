import type { CandidateMatch, ImportedPhotoDraft } from '../types';
import { identifyAlcoholProduct, repeatedOcrTerms } from './brandIdentification';

export interface AggregatedOcrEvidence {
  text: string;
  candidates: CandidateMatch[];
  volume?: number;
  abv?: number;
  sources: Record<string, string>;
}

export function aggregatePhotoOcr(drafts: ImportedPhotoDraft[]): AggregatedOcrEvidence {
  const ordered = [...drafts].sort((a, b) => evidencePriority(a) - evidencePriority(b));
  const text = ordered.map((draft) => draft.ocr.text.trim()).filter(Boolean).join('\n---\n');
  const candidateMap = new Map<string, CandidateMatch>();
  const combined = identifyAlcoholProduct({
    text,
    ocrConfidence: ordered.reduce((sum, draft) => sum + draft.ocr.confidence, 0) / Math.max(1, ordered.length),
    barcodeValues: [...new Set(ordered.flatMap((draft) => draft.barcodeValues ?? []))],
    imageCount: ordered.length,
    repeatedTerms: repeatedOcrTerms(ordered)
  });
  for (const candidate of combined) candidateMap.set(candidate.productId ?? `product:${candidate.productName}`, candidate);
  for (const draft of ordered) {
    for (const candidate of draft.candidates) {
      const key = candidate.productId ?? (candidate.productName ? `product:${candidate.productName}` : `maker:${candidate.makerName ?? ''}`);
      const existing = candidateMap.get(key);
      const sourceReason = `${imageLabel(draft.imageType)}: ${draft.fileName}`;
      if (!existing) candidateMap.set(key, { ...candidate, matchReasons: [...candidate.matchReasons, sourceReason] });
      else candidateMap.set(key, {
        ...existing,
        ...candidate,
        productName: existing.productName ?? candidate.productName,
        makerName: existing.makerName ?? candidate.makerName,
        alcoholType: existing.alcoholType ?? candidate.alcoholType,
        volume: existing.volume ?? candidate.volume,
        abv: existing.abv ?? candidate.abv,
        totalConfidence: Math.max(existing.totalConfidence ?? 0, candidate.totalConfidence ?? 0),
        matchReasons: [...new Set([...existing.matchReasons, ...candidate.matchReasons, sourceReason])]
      });
    }
  }
  const volumeSource = ordered.find((draft) => draft.candidates.some((candidate) => candidate.volume));
  const abvSource = ordered.find((draft) => draft.candidates.some((candidate) => candidate.abv));
  return {
    text,
    candidates: [...candidateMap.values()].sort((a, b) => (b.totalConfidence ?? 0) - (a.totalConfidence ?? 0)).slice(0, 8),
    volume: volumeSource?.candidates.find((candidate) => candidate.volume)?.volume,
    abv: abvSource?.candidates.find((candidate) => candidate.abv)?.abv,
    sources: {
      ...(volumeSource ? { volume: `${imageLabel(volumeSource.imageType)}: ${volumeSource.fileName}` } : {}),
      ...(abvSource ? { abv: `${imageLabel(abvSource.imageType)}: ${abvSource.fileName}` } : {})
    }
  };
}

function evidencePriority(draft: ImportedPhotoDraft) {
  return ({ frontLabel: 0, backLabel: 1, bottle: 2, receipt: 3, other: 4, glass: 5, food: 6 })[draft.imageType];
}

function imageLabel(type: ImportedPhotoDraft['imageType']) {
  return ({ frontLabel: '表ラベル', backLabel: '裏ラベル', bottle: 'ボトル全体', glass: 'グラス', food: '料理', receipt: 'レシート', other: 'その他' })[type];
}
