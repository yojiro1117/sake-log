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

  return {
    byType,
    favoriteFeatures: features.slice(0, 4),
    weakFeatures: features.slice(-4).reverse(),
    bestValues: logs.filter((log) => log.valueScore === 'S' || log.valueScore === 'A').slice(0, 5),
    repeatables: logs.filter((log) => log.repeatScore >= 5).slice(0, 5)
  };
}
