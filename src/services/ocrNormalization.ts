const confusionPairs: Array<[RegExp, string]> = [
  [/洒/g, '酒'], [/國/g, '国'], [/髙/g, '高'], [/﨑/g, '崎'], [/釀/g, '醸'],
  [/黒霧鳥/g, '黒霧島'], [/DAS[5S]AI/gi, 'DASSAI'], [/YAMAZAK1/gi, 'YAMAZAKI'], [/Ml\b/gi, 'ml']
];

const kanjiDigits: Record<string, string> = { '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9' };

export interface NormalizedOcrText {
  raw: string;
  nfkc: string;
  searchable: string;
  corrected: string;
  tokens: string[];
}

export function normalizeOcrForIdentification(raw: string): NormalizedOcrText {
  const nfkc = raw.normalize('NFKC').replace(/[‐‑‒–—―]/g, '-').replace(/[・･·]/g, ' ');
  let corrected = nfkc;
  for (const [pattern, replacement] of confusionPairs) corrected = corrected.replace(pattern, replacement);
  corrected = corrected.replace(/[〇一二三四五六七八九]/g, (value) => kanjiDigits[value] ?? value);
  const searchable = corrected.toLocaleLowerCase('ja-JP').replace(/[\s\p{P}\p{S}]+/gu, '');
  const tokens = corrected.toLocaleLowerCase('ja-JP').split(/[\s\p{P}\p{S}]+/u).filter((token) => token.length >= 2);
  return { raw, nfkc, searchable, corrected, tokens: [...new Set(tokens)] };
}

export function normalizeCatalogTerm(value: string) {
  return normalizeOcrForIdentification(value).searchable;
}

export function extractStructuredFields(text: string) {
  const normalized = text.normalize('NFKC');
  const volumes = [...normalized.matchAll(/(\d{2,4}(?:\.\d+)?)\s*(ml|mℓ|ℓ|l)\b/gi)].map((match) => {
    const amount = Number(match[1]);
    return /^l|ℓ$/i.test(match[2]) ? amount * 1000 : amount;
  }).filter((value) => value >= 50 && value <= 5000);
  const abvs = [...normalized.matchAll(/(?:アルコール(?:分|度数)?|alc(?:ohol)?\.?)[^\d]{0,8}(\d{1,2}(?:\.\d+)?)\s*(?:度|%|％)?/gi)]
    .map((match) => Number(match[1])).filter((value) => value >= 1 && value <= 70);
  const years = [...normalized.matchAll(/\b(\d{1,2})\s*(?:年|years?)\b/gi)].map((match) => Number(match[1]));
  return { volumes: [...new Set(volumes)], abvs: [...new Set(abvs)], years: [...new Set(years)] };
}

export function ngrams(value: string, size = 2) {
  const normalized = normalizeCatalogTerm(value);
  const result = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) result.add(normalized.slice(index, index + size));
  return result;
}

export function levenshteinSimilarity(left: string, right: string) {
  const a = normalizeCatalogTerm(left);
  const b = normalizeCatalogTerm(right);
  if (!a || !b) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let column = 1; column <= b.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= a.length; row += 1) {
      const held = rows[row];
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + (a[row - 1] === b[column - 1] ? 0 : 1));
      previous = held;
    }
  }
  return 1 - rows[a.length] / Math.max(a.length, b.length);
}

export function ngramSimilarity(left: string, right: string) {
  const a = ngrams(left);
  const b = ngrams(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return (2 * intersection) / (a.size + b.size);
}
