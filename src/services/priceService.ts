import type { AlcoholType, MarketPriceCandidate, SakeLog, SelectedMarketPriceSnapshot, UserSettings } from '../types';

interface RakutenItem {
  itemName: string;
  itemPrice: number;
  itemUrl: string;
  shopName: string;
  postageFlag?: number;
}

interface RakutenResponse {
  Items?: Array<{ Item: RakutenItem }>;
}

const exclusionWords = [
  'ふるさと納税',
  '飲み比べ',
  '飲みくらべ',
  'セット',
  'ギフト',
  '詰め合わせ',
  'ケース',
  '定期購入',
  '業務用',
  'ミニボトル',
  '送料無料条件',
  '箱付き',
  '限定',
  '旧商品'
];

export async function searchRakutenPrices(params: {
  productName: string;
  makerName?: string;
  volume?: number;
  alcoholType: AlcoholType;
  settings?: UserSettings;
}): Promise<{ candidates: MarketPriceCandidate[]; message?: string }> {
  const appId = params.settings?.rakutenApplicationId?.trim();
  if (!params.productName.trim()) return { candidates: [], message: '銘柄名を入力すると価格候補を検索できます。' };
  if (!appId) return { candidates: [], message: '楽天アプリIDが未設定です。過去価格候補または手入力を使用してください。' };

  const keyword = buildPriceSearchQueries(params)[0];
  const url = new URL('https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601');
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('genreId', '510901');
  url.searchParams.set('hits', '20');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) return { candidates: [], message: '楽天市場APIから価格候補を取得できませんでした。手入力できます。' };

  const data = (await response.json()) as RakutenResponse;
  const fetchedAt = new Date().toISOString();
  const candidates = (data.Items ?? [])
    .map(({ Item }) => createCandidateFromRakuten(Item, params, fetchedAt))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);

  return {
    candidates,
    message: candidates.length ? '価格候補を取得しました。採用する候補を選択してください。' : '一致する価格候補が見つかりませんでした。手入力できます。'
  };
}

export async function testRakutenApplicationId(applicationId: string) {
  const id = applicationId.trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return { ok: false, message: 'Application IDの形式を確認してください。' };
  const url = new URL('https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601');
  url.searchParams.set('applicationId', id);
  url.searchParams.set('keyword', '日本酒');
  url.searchParams.set('hits', '1');
  url.searchParams.set('format', 'json');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? { ok: true, message: '楽天市場APIへ接続できました。' } : { ok: false, message: `接続テストに失敗しました（HTTP ${response.status}）。` };
  } catch {
    return { ok: false, message: '接続テストに失敗しました。ネットワークを確認してください。' };
  }
}

export function buildPriceSearchQueries(params: {
  productName: string;
  makerName?: string;
  volume?: number;
  ocrText?: string;
  aliases?: string[];
}) {
  const base = normalizeSpaces(params.productName);
  const maker = normalizeSpaces(params.makerName ?? '');
  const volume = params.volume ? `${params.volume}ml` : '';
  const normalized = normalizeSpaces(base.normalize('NFKC'));
  const aliases = params.aliases ?? [];
  return [
    [base, maker, volume],
    [base, volume],
    [base, maker],
    [base],
    [normalized, maker, volume],
    [params.ocrText ? normalizeSpaces(params.ocrText).slice(0, 80) : ''],
    ...aliases.map((alias) => [alias, maker, volume])
  ]
    .map((parts) => parts.filter(Boolean).join(' ').trim())
    .filter((query, index, self) => query && self.indexOf(query) === index);
}

export function createCandidateFromRakuten(
  item: RakutenItem,
  params: { productName: string; makerName?: string; volume?: number; alcoholType: AlcoholType },
  fetchedAt: string
): MarketPriceCandidate {
  const reasons: string[] = [];
  const excludedReasons: string[] = [];
  let score = 0;
  const normalizedItem = normalize(item.itemName);
  const normalizedProduct = normalize(params.productName);

  if (normalizedItem.includes(normalizedProduct)) {
    score += 45;
    reasons.push('銘柄名一致');
  } else {
    score -= 20;
    excludedReasons.push('商品名曖昧');
  }

  if (params.makerName && normalizedItem.includes(normalize(params.makerName))) {
    score += 18;
    reasons.push('蔵元名一致');
  }

  const volume = extractVolumeMl(item.itemName);
  if (params.volume && volume === params.volume) {
    score += 22;
    reasons.push('容量一致');
  } else if (params.volume && volume && volume !== params.volume) {
    score -= 18;
    excludedReasons.push('容量不一致');
  }

  if (alcoholTypeKeyword(params.alcoholType).some((word) => normalizedItem.includes(normalize(word)))) {
    score += 8;
    reasons.push('酒種一致');
  }

  for (const word of exclusionWords) {
    if (item.itemName.includes(word)) {
      score -= 15;
      excludedReasons.push(`${word}の可能性`);
    }
  }

  const quantity = extractQuantity(item.itemName);
  if (quantity > 1) {
    score -= 18;
    excludedReasons.push('本数違い');
  }

  if (item.postageFlag === 1) {
    reasons.push('送料込み');
  } else {
    excludedReasons.push('送料別または送料不明');
  }

  const totalPrice = item.itemPrice;
  return {
    id: crypto.randomUUID(),
    itemName: item.itemName,
    shopName: item.shopName,
    itemUrl: item.itemUrl,
    price: item.itemPrice,
    shippingIncluded: item.postageFlag === 1,
    totalPrice,
    volumeMl: volume,
    quantity,
    unitPricePerBottle: quantity > 0 ? Math.round(totalPrice / quantity) : totalPrice,
    unitPricePer100ml: volume ? Math.round((totalPrice / volume) * 100) : undefined,
    source: 'rakuten',
    fetchedAt,
    matchScore: Math.max(0, Math.min(100, score)),
    matchReasons: reasons,
    excludedReasons,
    recommended: score >= 65 && excludedReasons.length === 0
  };
}

export function historyPriceCandidates(logs: SakeLog[], productName: string, makerName?: string): MarketPriceCandidate[] {
  const normalizedProduct = normalize(productName);
  const normalizedMaker = normalize(makerName ?? '');
  if (!normalizedProduct) return [];

  const candidates: MarketPriceCandidate[] = [];
  for (const log of logs) {
    if (!log.adoptedMarketPrice) continue;
    const reasons: string[] = [];
    let score = 0;
    if (normalize(log.productName).includes(normalizedProduct) || normalizedProduct.includes(normalize(log.productName))) {
      score += 45;
      reasons.push('過去登録の銘柄名一致');
    }
    if (normalizedMaker && log.makerName && normalize(log.makerName).includes(normalizedMaker)) {
      score += 20;
      reasons.push('過去登録の蔵元名一致');
    }
    if (score === 0) continue;
    candidates.push({
      id: crypto.randomUUID(),
      itemName: `${log.productName}（過去登録）`,
      shopName: log.shopName ?? '過去の酒ログ',
      itemUrl: undefined,
      price: log.adoptedMarketPrice ?? 0,
      totalPrice: log.adoptedMarketPrice ?? 0,
      source: 'history',
      fetchedAt: log.marketPriceFetchedAt ?? log.updatedAt,
      matchScore: score,
      matchReasons: reasons,
      excludedReasons: [],
      recommended: score >= 45
    });
  }

  return candidates
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

export function manualPriceCandidate(price: number): MarketPriceCandidate {
  return {
    id: crypto.randomUUID(),
    source: 'manual',
    itemName: '手入力価格',
    price,
    totalPrice: price,
    fetchedAt: new Date().toISOString(),
    matchScore: 0,
    matchReasons: ['手入力'],
    excludedReasons: [],
    recommended: false
  };
}

export function selectedPriceSnapshot(candidate: MarketPriceCandidate | undefined, manualPrice?: number): SelectedMarketPriceSnapshot {
  if (!candidate && manualPrice) {
    return {
      candidateId: null,
      adoptedMarketPrice: manualPrice,
      itemName: '手入力価格',
      source: 'manual',
      priceConfidence: 'manual',
      matchReasons: ['手入力']
    };
  }

  if (!candidate) {
    return {
      candidateId: null,
      source: 'unfetched',
      priceConfidence: 'unknown',
      matchReasons: []
    };
  }

  return {
    candidateId: candidate.id,
    adoptedMarketPrice: candidate.totalPrice ?? candidate.price,
    itemName: candidate.itemName,
    shopName: candidate.shopName,
    itemUrl: candidate.itemUrl,
    source: candidate.source,
    fetchedAt: candidate.fetchedAt,
    volumeMl: candidate.volumeMl,
    quantity: candidate.quantity,
    shippingFee: candidate.shippingFee,
    shippingIncluded: candidate.shippingIncluded,
    totalPrice: candidate.totalPrice,
    priceConfidence: candidate.matchScore >= 75 ? 'high' : candidate.matchScore >= 45 ? 'medium' : 'low',
    matchReasons: candidate.matchReasons
  };
}

function extractVolumeMl(name: string) {
  const match = name.match(/(\d{3,4})\s?m[lLｍＭ]/);
  return match ? Number(match[1]) : undefined;
}

function extractQuantity(name: string) {
  const match = name.match(/(?:×|x|X|\*)\s?(\d+)|(\d+)\s?(?:本|個|缶|瓶)セット/);
  return Number(match?.[1] ?? match?.[2] ?? 1);
}

function alcoholTypeKeyword(type: AlcoholType) {
  return {
    sake: ['日本酒', '清酒'],
    shochu: ['焼酎'],
    beer: ['ビール'],
    whisky: ['ウイスキー', 'whisky', 'whiskey'],
    wine: ['ワイン'],
    gin: ['ジン'],
    vodka: ['ウォッカ'],
    rum: ['ラム'],
    tequila: ['テキーラ'],
    liqueur: ['リキュール'],
    other: []
  }[type];
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s/g, '');
}

function normalizeSpaces(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
