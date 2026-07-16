export function buildCatalogCandidates(ocrText, catalogEntries) {
  const corrected = correctOcrConfusions(ocrText);
  const normalized = normalizeForMatch(corrected);
  const tokens = corrected.split(/[\s\p{P}\p{S}]+/u).map(normalizeForMatch).filter((item) => item.length >= 2 && item.length <= 48);
  if (!normalized) return [];
  return catalogEntries.flatMap((entry) => {
    const aliases = [...new Set([entry.brandFamily, entry.canonicalProductName, ...entry.aliases, ...entry.kanaAliases, ...entry.latinAliases, ...entry.commonOcrErrors])];
    const alias = aliases.find((item) => isGroundedMatch(normalized, tokens, normalizeForMatch(item)));
    const makerValue = normalizeForMatch(entry.makerName ?? '');
    const maker = makerValue.length >= 2 && normalized.includes(makerValue);
    if (!alias && !maker) return [];
    return [{
      productName: entry.canonicalProductName,
      makerName: entry.makerName,
      alcoholType: entry.alcoholType,
      matchReasons: [alias ? `OCR別名一致: ${alias}` : undefined, maker ? '蔵元一致' : undefined].filter(Boolean)
    }];
  });
}

function isGroundedMatch(text, tokens, alias) {
  if (alias.length < 2) return false;
  if (text.includes(alias)) return true;
  if (alias.length < 4) return false;
  return tokens.some((token) => {
    const lengthRatio = Math.min(token.length, alias.length) / Math.max(token.length, alias.length);
    return lengthRatio >= 0.65 && (ngramSimilarity(token, alias) >= 0.72 || levenshteinSimilarity(token, alias) >= 0.78);
  });
}

function correctOcrConfusions(value) {
  return value.normalize('NFKC')
    .replace(/黒霧鳥/g, '黒霧島').replace(/黑霧島/g, '黒霧島')
    .replace(/獺蔡/g, '獺祭').replace(/獺察/g, '獺祭')
    .replace(/DAS5AI/gi, 'DASSAI').replace(/YAMAZAK1/gi, 'YAMAZAKI').replace(/山碕/g, '山崎');
}

function normalizeForMatch(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function ngramSimilarity(a, b, n = 2) {
  const left = ngrams(a, n); const right = ngrams(b, n);
  if (!left.size || !right.size) return 0;
  return (2 * [...left].filter((gram) => right.has(gram)).length) / (left.size + right.size);
}

function ngrams(value, size) {
  const result = new Set();
  for (let index = 0; index <= value.length - size; index += 1) result.add(value.slice(index, index + size));
  return result;
}

function levenshteinSimilarity(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length, 1);
}
