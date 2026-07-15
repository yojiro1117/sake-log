import type { AlcoholProductCatalogEntry } from '../types';
import { levenshteinSimilarity, ngramSimilarity, normalizeCatalogTerm, normalizeOcrForIdentification } from './ocrNormalization';

export interface RetrievedCatalogCandidate {
  entry: AlcoholProductCatalogEntry;
  retrievalScore: number;
  retrievalReasons: string[];
  matchedTerms: string[];
}

export function retrieveCatalogCandidates(text: string, catalog: AlcoholProductCatalogEntry[], limit = 20): RetrievedCatalogCandidate[] {
  const normalized = normalizeOcrForIdentification(text);
  if (!normalized.searchable) return [];

  return catalog.map((entry) => {
    const terms = [entry.canonicalProductName, entry.brandFamily, entry.makerName, ...entry.aliases, ...entry.kanaAliases, ...entry.latinAliases, ...entry.commonOcrErrors]
      .filter(Boolean).map((term) => ({ raw: term, normalized: normalizeCatalogTerm(term) })).filter((term) => term.normalized.length >= 2);
    let score = 0;
    const reasons: string[] = [];
    const matchedTerms: string[] = [];
    for (const term of terms) {
      if (normalized.searchable.includes(term.normalized)) {
        const exactScore = term.normalized === normalizeCatalogTerm(entry.canonicalProductName) ? 100 : 88;
        if (exactScore > score) score = exactScore;
        reasons.push(`OCR一致: ${term.raw}`);
        matchedTerms.push(term.raw);
        continue;
      }
      const windows = normalized.tokens.length ? normalized.tokens : [normalized.corrected];
      const fuzzy = Math.max(...windows.map((token) => Math.max(levenshteinSimilarity(token, term.raw), ngramSimilarity(token, term.raw))));
      const threshold = term.normalized.length <= 3 ? 0.78 : 0.56;
      if (fuzzy >= threshold) {
        score = Math.max(score, Math.round(fuzzy * 72));
        reasons.push(`類似文字 ${Math.round(fuzzy * 100)}%: ${term.raw}`);
        matchedTerms.push(term.raw);
      }
    }
    return { entry, retrievalScore: Math.min(100, score), retrievalReasons: [...new Set(reasons)], matchedTerms: [...new Set(matchedTerms)] };
  }).filter((item) => item.retrievalScore >= 36)
    .sort((left, right) => right.retrievalScore - left.retrievalScore || left.entry.productId.localeCompare(right.entry.productId))
    .slice(0, limit);
}
