import type { CandidateMatch } from '../types';

export interface CalibrationResult {
  candidates: CandidateMatch[];
  abstained: boolean;
  reason?: string;
}

export function calibrateIdentificationCandidates(candidates: CandidateMatch[]): CalibrationResult {
  const calibrated = candidates.map((candidate) => {
    const kinds = new Set(candidate.evidences?.map((item) => item.kind) ?? []);
    const independent = [...kinds].filter((kind) => kind !== 'fuzzy' && kind !== 'alias').length;
    const hasStrongIdentity = kinds.has('jan') || kinds.has('exact') || (kinds.has('alias') && kinds.has('maker'));
    const singleWeakSource = kinds.size <= 1 || ([...kinds].every((kind) => kind === 'visual' || kind === 'fuzzy' || kind === 'alias'));
    let value = candidate.calibratedConfidence ?? candidate.totalConfidence ?? 0;
    if (singleWeakSource) value = Math.min(value, 61);
    if (!hasStrongIdentity && independent < 2) value = Math.min(value, 78);
    if ((candidate.mismatchReasons?.length ?? 0) > 0) value -= Math.min(24, candidate.mismatchReasons!.length * 8);
    value = Math.max(0, Math.min(97, Math.round(value)));
    return {
      ...candidate,
      calibratedConfidence: value,
      totalConfidence: value,
      confidence: value >= 86 ? 'high' as const : value >= 62 ? 'medium' as const : 'low' as const,
      requiresConfirmation: true
    };
  }).sort((left, right) => (right.calibratedConfidence ?? 0) - (left.calibratedConfidence ?? 0));
  const top = calibrated[0];
  if (!top) return { candidates: [], abstained: true, reason: '根拠のある候補がありません。' };
  const margin = (top.calibratedConfidence ?? 0) - (calibrated[1]?.calibratedConfidence ?? 0);
  const kinds = new Set(top.evidences?.map((item) => item.kind) ?? []);
  const strong = kinds.has('jan') || kinds.has('exact') || (kinds.has('alias') && kinds.has('maker'));
  if ((top.calibratedConfidence ?? 0) < 45 || (!strong && margin < 7)) {
    return { candidates: [], abstained: true, reason: '候補間の差または独立した根拠が不足しています。' };
  }
  return { candidates: calibrated.slice(0, 5).map((candidate, index) => ({ ...candidate, rank: index + 1 })), abstained: false };
}
