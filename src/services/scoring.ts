import type { AlcoholType, Confidence, CostPerformance, MarketPriceCandidate } from '../types';

export function averageScore(scores: Record<string, number>) {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

export function correctedScore(base: number, satisfaction: number, context: { food?: string; mood?: string; priceImpression?: string }) {
  let adjustment = 0;
  const reasons: string[] = [];

  if (context.food?.trim()) {
    adjustment += 0.15;
    reasons.push('食事との相性が満足度を少し押し上げました');
  }
  if (context.mood && ['良い', '楽しい', '特別'].some((word) => context.mood?.includes(word))) {
    adjustment += 0.1;
    reasons.push('飲んだ場面の印象が良好でした');
  }
  if (context.priceImpression?.includes('高い')) {
    adjustment -= 0.15;
    reasons.push('価格印象を少し厳しめに反映しました');
  }

  const score = Math.max(1, Math.min(6, (base * 0.65 + satisfaction * 0.35 + adjustment)));
  return {
    score: Number(score.toFixed(1)),
    reason: reasons.length > 0 ? reasons.join('。') + '。' : '基礎評価と総合満足度を中心に、点数が大きく動きすぎない範囲で補正しました。'
  };
}

export function summarizePrices(candidates: MarketPriceCandidate[]) {
  const prices = candidates.map((candidate) => candidate.itemPrice).filter((price) => price > 0).sort((a, b) => a - b);
  if (prices.length === 0) return {};
  const sum = prices.reduce((total, price) => total + price, 0);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[middle - 1] + prices[middle]) / 2 : prices[middle];

  return {
    marketPriceMin: prices[0],
    marketPriceMedian: Math.round(median),
    marketPriceAverage: Math.round(sum / prices.length),
    adoptedMarketPrice: Math.round(median)
  };
}

export function evaluateValue(satisfaction: number, adoptedPrice?: number): { valueScore: CostPerformance; priceConfidence: Confidence } {
  if (!adoptedPrice) return { valueScore: 'B', priceConfidence: 'manual' };

  const priceBandBonus = adoptedPrice <= 1000 ? 0.8 : adoptedPrice <= 2500 ? 0.35 : adoptedPrice <= 5000 ? 0 : -0.35;
  const adjusted = satisfaction + priceBandBonus;

  if (adjusted >= 5.4) return { valueScore: 'S', priceConfidence: 'high' };
  if (adjusted >= 4.6) return { valueScore: 'A', priceConfidence: 'medium' };
  if (adjusted >= 3.6) return { valueScore: 'B', priceConfidence: 'medium' };
  return { valueScore: 'C', priceConfidence: 'low' };
}

export function getDominantFeature(scores: Record<string, number>, labels: Record<string, string>) {
  const [key, value] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] ?? ['balance', 0];
  return `${labels[key] ?? key}が${value >= 5 ? 'しっかり際立つ' : 'ほどよく感じられる'}味わい`;
}

export function pairingSuggestions(type: AlcoholType, scores: Record<string, number>): string[] {
  const strong = (key: string) => (scores[key] ?? 0) >= 5;
  const suggestions = new Set<string>();

  if (type === 'sake') {
    if (strong('sweetness')) ['焼き鳥', 'チーズ', '塩気のある料理'].forEach((item) => suggestions.add(item));
    if (strong('acidity')) ['白身魚', '酢の物', 'カルパッチョ'].forEach((item) => suggestions.add(item));
    if (strong('umami')) ['煮物', '味噌料理', '出汁料理'].forEach((item) => suggestions.add(item));
    if (strong('finish')) ['揚げ物', '脂のある料理'].forEach((item) => suggestions.add(item));
  }
  if (type === 'wine') {
    if (strong('fruit')) ['ロースト肉', 'チーズ', 'トマト料理'].forEach((item) => suggestions.add(item));
    if (strong('acidity')) ['魚介', 'サラダ', 'マリネ'].forEach((item) => suggestions.add(item));
    if (strong('tannin')) ['赤身肉', '熟成チーズ'].forEach((item) => suggestions.add(item));
    if (strong('body')) ['濃い味付けの肉料理'].forEach((item) => suggestions.add(item));
  }
  if (type === 'shochu') {
    if (strong('materialAroma')) ['炭火焼き', '郷土料理'].forEach((item) => suggestions.add(item));
    if (strong('roast')) ['焼き物', '揚げ物'].forEach((item) => suggestions.add(item));
    if (strong('finish')) ['刺身', '天ぷら', '脂のある料理'].forEach((item) => suggestions.add(item));
  }
  if (type === 'beer') {
    if (strong('bitterness')) ['揚げ物', 'ソーセージ'].forEach((item) => suggestions.add(item));
    if (strong('malt')) ['肉料理', '煮込み料理'].forEach((item) => suggestions.add(item));
    if (strong('hop')) ['スパイス料理', 'ピザ'].forEach((item) => suggestions.add(item));
    if ((scores.mouthfeel ?? 0) <= 3) ['前菜', '軽食'].forEach((item) => suggestions.add(item));
  }

  if (suggestions.size === 0) ['軽い前菜', '定番のおつまみ', '季節の料理'].forEach((item) => suggestions.add(item));
  return [...suggestions].slice(0, 4);
}
