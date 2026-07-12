import { alcoholProfiles } from '../data/alcoholProfiles';
import type { AlcoholType, SakeLog } from '../types';

export function analyzeLogs(logs: SakeLog[]) {
  const byType = Object.keys(alcoholProfiles).map((type) => {
    const typed = logs.filter((log) => log.alcoholType === type);
    const average = typed.length
      ? typed.reduce((sum, log) => sum + log.satisfactionScore, 0) / typed.length
      : 0;
    return {
      type: type as AlcoholType,
      label: alcoholProfiles[type as AlcoholType].label,
      count: typed.length,
      average: Number(average.toFixed(1))
    };
  });

  const featureScores = new Map<string, { label: string; total: number; count: number }>();
  logs.forEach((log) => {
    alcoholProfiles[log.alcoholType].axes.forEach((axis) => {
      const current = featureScores.get(axis.label) ?? { label: axis.label, total: 0, count: 0 };
      current.total += log.baseScores[axis.key] ?? 0;
      current.count += 1;
      featureScores.set(axis.label, current);
    });
  });

  const features = [...featureScores.values()]
    .map((item) => ({ label: item.label, average: Number((item.total / item.count).toFixed(1)) }))
    .sort((a, b) => b.average - a.average);

  const makerScores = new Map<string, { name: string; total: number; count: number }>();
  logs.forEach((log) => {
    if (!log.makerName) return;
    const current = makerScores.get(log.makerName) ?? { name: log.makerName, total: 0, count: 0 };
    current.total += log.satisfactionScore;
    current.count += 1;
    makerScores.set(log.makerName, current);
  });

  const priced = logs.map((log) => log.adoptedMarketPrice ?? log.purchasePrice).filter((price): price is number => Boolean(price));
  const averagePrice = priced.length ? Math.round(priced.reduce((sum, price) => sum + price, 0) / priced.length) : 0;
  const averageRating = logs.length ? Number((logs.reduce((sum, log) => sum + log.satisfactionScore, 0) / logs.length).toFixed(1)) : 0;
  const priceBands = [
    { label: '〜1,000円', count: priced.filter((price) => price <= 1000).length },
    { label: '1,001〜2,500円', count: priced.filter((price) => price > 1000 && price <= 2500).length },
    { label: '2,501〜5,000円', count: priced.filter((price) => price > 2500 && price <= 5000).length },
    { label: '5,001円〜', count: priced.filter((price) => price > 5000).length }
  ];

  return {
    byType,
    favoriteType: byType.filter((item) => item.count > 0).sort((a, b) => b.average - a.average)[0],
    favoriteMakers: [...makerScores.values()]
      .map((maker) => ({ name: maker.name, average: Number((maker.total / maker.count).toFixed(1)), count: maker.count }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 5),
    averagePrice,
    averageRating,
    priceBands,
    favoriteFeatures: features.slice(0, 4),
    weakFeatures: features.slice(-4).reverse(),
    bestValues: logs.filter((log) => log.valueScore === 'S' || log.valueScore === 'A').slice(0, 5),
    repeatables: logs.filter((log) => log.repeatScore >= 5).slice(0, 5)
  };
}
