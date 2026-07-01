import type { AlcoholType, MarketPriceCandidate, SakeLog, UserSettings } from '../types';

interface RakutenItem {
  itemName: string;
  itemPrice: number;
  itemUrl: string;
  shopName: string;
}

interface RakutenResponse {
  Items?: Array<{ Item: RakutenItem }>;
}

const exclusionWords = ['ふるさと納税', 'セット', '飲み比べ', 'ギフト', '詰め合わせ', 'ケース'];

export async function searchRakutenPrices(params: {
  productName: string;
  makerName?: string;
  volume?: number;
  alcoholType: AlcoholType;
  settings?: UserSettings;
}): Promise<MarketPriceCandidate[]> {
  const appId = params.settings?.rakutenApplicationId?.trim();
  if (!appId || !params.productName.trim()) return [];

  const keyword = [params.productName, params.makerName, params.volume ? `${params.volume}ml` : undefined]
    .filter(Boolean)
    .join(' ');
  const url = new URL('https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601');
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('genreId', '510901');
  url.searchParams.set('hits', '20');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) throw new Error('楽天市場APIから価格候補を取得できませんでした。');
  const data = (await response.json()) as RakutenResponse;
  const fetchedAt = new Date().toISOString();

  return (data.Items ?? [])
    .map(({ Item }) => Item)
    .filter((item) => !exclusionWords.some((word) => item.itemName.includes(word)))
    .slice(0, 8)
    .map((item) => ({
      id: crypto.randomUUID(),
      itemName: item.itemName,
      shopName: item.shopName,
      itemPrice: item.itemPrice,
      itemUrl: item.itemUrl,
      source: 'rakuten' as const,
      fetchedAt,
      confidence: item.itemName.includes(params.productName) ? 'medium' : 'low'
    }));
}

export function historyPriceCandidates(logs: SakeLog[], productName: string): MarketPriceCandidate[] {
  return logs
    .filter((log) => log.productName && productName && log.productName.includes(productName) && log.adoptedMarketPrice)
    .slice(0, 5)
    .map((log) => ({
      id: crypto.randomUUID(),
      itemName: `${log.productName}（過去登録）`,
      shopName: log.shopName ?? '過去ログ',
      itemPrice: log.adoptedMarketPrice ?? 0,
      itemUrl: '',
      source: 'history' as const,
      fetchedAt: log.marketPriceFetchedAt ?? log.updatedAt,
      confidence: 'manual' as const
    }));
}
