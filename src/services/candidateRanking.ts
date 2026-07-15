import type { CandidateEvidence, CandidateMatch } from '../types';
import type { RetrievedCatalogCandidate } from './candidateRetrieval';
import { extractStructuredFields, normalizeCatalogTerm, normalizeOcrForIdentification } from './ocrNormalization';

export interface RankingContext {
  text: string;
  ocrConfidence: number;
  barcodeValues?: string[];
  imageCount?: number;
  repeatedTerms?: string[];
  visualScores?: Record<string, number>;
  alcoholTypeHint?: CandidateMatch['alcoholType'];
}

export function rankCatalogCandidates(retrieved: RetrievedCatalogCandidate[], context: RankingContext): CandidateMatch[] {
  const normalized = normalizeOcrForIdentification(context.text);
  const fields = extractStructuredFields(context.text);
  const ranked = retrieved.map(({ entry, retrievalScore, retrievalReasons }) => {
    const evidences: CandidateEvidence[] = [];
    const add = (kind: CandidateEvidence['kind'], score: number, detail: string) => evidences.push({ kind, score, detail });
    const canonical = normalizeCatalogTerm(entry.canonicalProductName);
    const brand = normalizeCatalogTerm(entry.brandFamily);
    const maker = normalizeCatalogTerm(entry.makerName);
    const aliasMatch = [...entry.aliases, ...entry.kanaAliases, ...entry.latinAliases, ...entry.commonOcrErrors]
      .find((term) => normalized.searchable.includes(normalizeCatalogTerm(term)));
    if (normalized.searchable.includes(canonical)) add('exact', 62, `正式商品名一致: ${entry.canonicalProductName}`);
    else if (normalized.searchable.includes(brand)) add('alias', 46, `ブランド一致: ${entry.brandFamily}`);
    else if (aliasMatch) add('alias', 46, `別名一致: ${aliasMatch}`);
    else add('fuzzy', retrievalScore * 0.5, retrievalReasons[0] ?? '類似文字一致');
    if (maker && normalized.searchable.includes(maker)) add('maker', 20, `蔵元・メーカー一致: ${entry.makerName}`);
    const barcode = context.barcodeValues?.find((value) => entry.janCodes.includes(value));
    if (barcode) add('jan', 100, `JAN/EAN完全一致: ${barcode}`);
    const volume = fields.volumes.find((value) => entry.volumesMl.includes(value));
    if (volume) add('volume', 8, `容量一致: ${volume}ml`);
    const abv = fields.abvs.find((value) => entry.abvMin !== undefined && entry.abvMax !== undefined && value >= entry.abvMin && value <= entry.abvMax);
    if (abv) add('abv', 7, `アルコール度数一致: ${abv}%`);
    if (context.alcoholTypeHint === entry.alcoholType) add('type', 5, `酒種一致: ${entry.alcoholType}`);
    if ((context.imageCount ?? 1) > 1 && context.repeatedTerms?.some((term) => normalizeCatalogTerm(term).includes(brand))) add('multi-photo', 12, '複数写真でブランド文字が反復');
    const visual = context.visualScores?.[entry.productId];
    if (visual !== undefined && visual >= 0.78) add('visual', Math.min(18, visual * 18), `確認済み写真との視覚類似 ${Math.round(visual * 100)}%`);
    for (const keyword of entry.keywords) if (normalized.searchable.includes(normalizeCatalogTerm(keyword))) add('alias', 5, `バリエーション語一致: ${keyword}`);

    let raw = evidences.reduce((sum, item) => sum + item.score, 0);
    const mismatchReasons: string[] = [];
    for (const keyword of entry.exclusionKeywords) if (normalized.searchable.includes(normalizeCatalogTerm(keyword))) {
      raw -= 24;
      mismatchReasons.push(`除外語が存在: ${keyword}`);
    }
    if (fields.volumes.length && entry.volumesMl.length && !volume) { raw -= 6; mismatchReasons.push(`容量不一致: OCR ${fields.volumes.join('/')}ml`); }
    if (fields.abvs.length && entry.abvMin !== undefined && !abv) { raw -= 5; mismatchReasons.push(`度数不一致: OCR ${fields.abvs.join('/')}%`); }
    const calibrated = calibrateConfidence(raw, context.ocrConfidence, evidences);
    return {
      productId: entry.productId, brandFamily: entry.brandFamily, productName: entry.canonicalProductName,
      variantName: entry.variantName, makerName: entry.makerName, alcoholType: entry.alcoholType,
      volume, abv, barcode, evidences, matchReasons: evidences.map((item) => item.detail), mismatchReasons,
      productConfidence: Math.round(Math.min(100, retrievalScore)), makerConfidence: evidences.some((item) => item.kind === 'maker') ? 100 : 0,
      alcoholTypeConfidence: evidences.some((item) => item.kind === 'type') ? 100 : 55,
      volumeConfidence: volume ? 100 : 0, ocrConfidence: context.ocrConfidence,
      totalConfidence: calibrated, calibratedConfidence: calibrated,
      confidence: calibrated >= 86 ? 'high' as const : calibrated >= 62 ? 'medium' as const : 'low' as const,
      requiresConfirmation: true, visualSimilarity: visual
    };
  }).filter((item) => item.evidences?.some((evidence) => evidence.kind === 'jan') || (item.totalConfidence ?? 0) >= 34)
    .sort((left, right) => (right.totalConfidence ?? 0) - (left.totalConfidence ?? 0));
  return ranked.slice(0, 5).map((item, index) => ({ ...item, rank: index + 1 }));
}

export function calibrateConfidence(raw: number, ocrConfidence: number, evidences: CandidateEvidence[]) {
  if (evidences.some((item) => item.kind === 'jan')) return 99;
  const independentKinds = new Set(evidences.map((item) => item.kind));
  const evidenceAdjustment = Math.max(0, independentKinds.size - 1) * 2.5;
  const ocrAdjustment = Math.max(-12, Math.min(8, (ocrConfidence - 0.5) * 24));
  return Math.round(Math.max(0, Math.min(96, raw + evidenceAdjustment + ocrAdjustment)));
}
