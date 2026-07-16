import type { CandidateMatch, ImportedPhotoDraft } from '../types';
import { identifyAlcoholProductPipeline } from './productIdentificationPipeline';

export interface AggregatedOcrEvidence {
  text: string;
  candidates: CandidateMatch[];
  volume?: number;
  abv?: number;
  sources: Record<string, string>;
  runId?: string;
}

export const emptyAggregatedOcr: AggregatedOcrEvidence = { text:'', candidates:[], sources:{} };

export async function aggregatePhotoOcr(drafts: ImportedPhotoDraft[], signal?: AbortSignal): Promise<AggregatedOcrEvidence> {
  if (!drafts.length) return emptyAggregatedOcr;
  const ordered = [...drafts].sort((left, right) => evidencePriority(left) - evidencePriority(right));
  const result = await identifyAlcoholProductPipeline({
    images:ordered.map((draft) => ({
      imageId:draft.id,
      imageType:draft.identificationPhotoType ?? draft.imageType,
      ocrText:draft.ocr.text,
      ocrConfidence:draft.ocr.confidence,
      barcodeValues:draft.barcodeValues,
      fingerprint:draft.visualFingerprint
    })),
    path:ordered.length > 1 ? 'deep' : undefined,
    persist:false,
    signal
  });
  const topWithVolume = result.candidates.find((candidate) => candidate.volume);
  const topWithAbv = result.candidates.find((candidate) => candidate.abv);
  return {
    text:ordered.map((draft) => draft.ocr.text.trim()).filter(Boolean).join('\n---\n'),
    candidates:result.candidates,
    volume:topWithVolume?.volume,
    abv:topWithAbv?.abv,
    sources:{
      ...(topWithVolume ? { volume:'複数写真の統合証拠' } : {}),
      ...(topWithAbv ? { abv:'複数写真の統合証拠' } : {})
    },
    runId:result.runId
  };
}

function evidencePriority(draft: ImportedPhotoDraft) {
  return ({ frontLabel:0, backLabel:1, bottle:2, receipt:3, other:4, glass:5, food:6 })[draft.imageType];
}
