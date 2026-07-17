import type { AlcoholProductCatalogEntry, CandidateSource } from '../types';
import { levenshteinSimilarity, ngramSimilarity, normalizeCatalogTerm, normalizeOcrForIdentification } from './ocrNormalization';

export interface RetrievedCatalogCandidate {
  entry: AlcoholProductCatalogEntry;
  retrievalScore: number;
  retrievalReasons: string[];
  matchedTerms: string[];
  sources?: CandidateSource[];
}

export function retrieveCatalogCandidates(text: string, catalog: AlcoholProductCatalogEntry[], limit = 20): RetrievedCatalogCandidate[] {
  const normalized = normalizeOcrForIdentification(text);
  if (!normalized.searchable) return [];

  return catalog.map((entry) => {
    const terms = [
      { raw:entry.canonicalProductName, kind:'product' as const },
      { raw:entry.brandFamily, kind:'brand' as const },
      ...entry.aliases.map((raw) => ({ raw, kind:'alias' as const })),
      ...entry.kanaAliases.map((raw) => ({ raw, kind:'alias' as const })),
      ...entry.latinAliases.map((raw) => ({ raw, kind:'alias' as const })),
      ...entry.commonOcrErrors.map((raw) => ({ raw, kind:'ocr-error' as const })),
      { raw:entry.makerName, kind:'maker' as const }
    ].filter((term) => Boolean(term.raw)).map((term) => ({ ...term, normalized: normalizeCatalogTerm(term.raw) })).filter((term) => term.normalized.length >= 2);
    let score = 0;
    const reasons: string[] = [];
    const matchedTerms: string[] = [];
    for (const term of terms) {
      if (normalized.searchable.includes(term.normalized)) {
        const exactScore = term.kind === 'maker' ? 34 : term.normalized === normalizeCatalogTerm(entry.canonicalProductName) ? 100 : 88;
        if (exactScore > score) score = exactScore;
        reasons.push(`OCR一致: ${term.raw}`);
        matchedTerms.push(term.raw);
        continue;
      }
      const windows = normalized.tokens.length ? normalized.tokens : [normalized.corrected];
      const fuzzy = Math.max(...windows.map((token) => Math.max(levenshteinSimilarity(token, term.raw), ngramSimilarity(token, term.raw))));
      if (term.kind === 'maker') continue;
      const threshold = term.normalized.length <= 3 ? 0.82 : 0.74;
      if (fuzzy >= threshold) {
        score = Math.max(score, Math.round(fuzzy * 72));
        reasons.push(`類似文字 ${Math.round(fuzzy * 100)}%: ${term.raw}`);
        matchedTerms.push(term.raw);
      }
    }
    return { entry, retrievalScore: Math.min(100, score), retrievalReasons: [...new Set(reasons)], matchedTerms: [...new Set(matchedTerms)], sources:['text'] as CandidateSource[] };
  }).filter((item) => item.retrievalScore >= 36)
    .sort((left, right) => right.retrievalScore - left.retrievalScore || left.entry.productId.localeCompare(right.entry.productId))
    .slice(0, limit);
}

export function retrieveBarcodeCandidates(values: string[], catalog: AlcoholProductCatalogEntry[]): RetrievedCatalogCandidate[] {
  const barcodes = new Set(values.map((value) => value.replace(/\D/g, '')).filter(Boolean));
  if (!barcodes.size) return [];
  return catalog.flatMap((entry) => {
    const matched = entry.janCodes.find((code) => barcodes.has(code.replace(/\D/g, '')));
    return matched ? [{ entry, retrievalScore:100, retrievalReasons:[`JAN/EAN完全一致: ${matched}`], matchedTerms:[matched], sources:['barcode'] as CandidateSource[] }] : [];
  });
}

export function retrieveExactImageCandidates(productIds: string[], catalog: AlcoholProductCatalogEntry[]): RetrievedCatalogCandidate[] {
  return retrieveProductIdCandidates(productIds, catalog, 'exact-image', '同じ画像の確認済み参照と一致', 100);
}

export function retrieveVisualCandidates(scores: Record<string, number>, catalog: AlcoholProductCatalogEntry[], minimum = 0.84): RetrievedCatalogCandidate[] {
  const byId = new Map(catalog.map((entry) => [entry.productId, entry]));
  return Object.entries(scores).flatMap(([productId, similarity]) => {
    const entry = byId.get(productId);
    return entry && similarity >= minimum
      ? [{ entry, retrievalScore:Math.round(similarity * 82), retrievalReasons:[`確認済み写真との視覚類似 ${Math.round(similarity * 100)}%`], matchedTerms:[], sources:['visual'] as CandidateSource[] }]
      : [];
  }).sort((left, right) => right.retrievalScore - left.retrievalScore);
}

export function retrieveProductIdCandidates(
  productIds: string[],
  catalog: AlcoholProductCatalogEntry[],
  source: Extract<CandidateSource, 'exact-image' | 'history' | 'correction' | 'multi-photo'>,
  reason: string,
  score = 64
): RetrievedCatalogCandidate[] {
  const ids = new Set(productIds);
  return catalog.filter((entry) => ids.has(entry.productId)).map((entry) => ({
    entry, retrievalScore:score, retrievalReasons:[reason], matchedTerms:[], sources:[source]
  }));
}

export function unionRetrievedCandidates(...sets: RetrievedCatalogCandidate[][]): RetrievedCatalogCandidate[] {
  const union = new Map<string, RetrievedCatalogCandidate>();
  for (const item of sets.flat()) {
    const existing = union.get(item.entry.productId);
    if (!existing) union.set(item.entry.productId, { ...item });
    else union.set(item.entry.productId, {
      ...existing,
      retrievalScore:Math.max(existing.retrievalScore, item.retrievalScore),
      retrievalReasons:[...new Set([...existing.retrievalReasons, ...item.retrievalReasons])],
      matchedTerms:[...new Set([...existing.matchedTerms, ...item.matchedTerms])],
      sources:[...new Set([...(existing.sources ?? []), ...(item.sources ?? [])])]
    });
  }
  return [...union.values()].sort((left, right) => right.retrievalScore - left.retrievalScore);
}
