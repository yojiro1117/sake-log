import type { NativeTextObservation } from '../platform/visionTypes';
import { normalizeCatalogTerm } from './ocrNormalization';

export interface AggregatedNativeText {
  text: string;
  confidence: number;
  observations: NativeTextObservation[];
  repeatedTerms: string[];
}

export function aggregateNativeText(observations: NativeTextObservation[]): AggregatedNativeText {
  const groups = new Map<string, NativeTextObservation[]>();
  for (const observation of observations) {
    const key = normalizeCatalogTerm(observation.text);
    if (key.length < 1) continue;
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const selected = [...groups.values()]
    .map((items) => [...items].sort((a, b) => b.confidence - a.confidence)[0])
    .filter((item): item is NativeTextObservation => Boolean(item))
    .sort((a, b) => regionPriority(a.regionType) - regionPriority(b.regionType) || b.confidence - a.confidence);
  const repeatedTerms = [...groups.entries()].filter(([, items]) => new Set(items.map((item) => item.passId)).size >= 2).map(([term]) => term);
  const weighted = selected.reduce((sum, item) => sum + Math.min(1, item.confidence + (repeatedTerms.includes(normalizeCatalogTerm(item.text)) ? 0.08 : 0)), 0);
  return {
    text: selected.map((item) => item.text.trim()).filter(Boolean).join('\n'),
    confidence: selected.length ? weighted / selected.length : 0,
    observations: selected,
    repeatedTerms
  };
}

function regionPriority(region: NativeTextObservation['regionType']) {
  return { frontLabel: 0, backLabel: 1, neckLabel: 2, barcode: 3, fullImage: 4 }[region];
}
