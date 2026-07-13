import { describe, expect, it } from 'vitest';
import { highScoreRanking, valueRanking } from './scoring';
import type { SakeLog } from '../types';

const baseLog = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  alcoholType: 'sake',
  productName: '',
  baseScores: {},
  satisfactionScore: 3,
  repeatScore: 3,
  foodMatchScore: 3,
  correctedScore: 3,
  correctionReason: '',
  tags: [],
  userConfirmed: true
} satisfies Partial<SakeLog>;

function log(partial: Partial<SakeLog>): SakeLog {
  return { ...baseLog, logId: crypto.randomUUID(), ...partial } as SakeLog;
}

describe('rankings', () => {
  it('sorts high score ranking by satisfaction, corrected score, repeat score, then date', () => {
    const oldBest = log({ productName: 'old best', satisfactionScore: 6, correctedScore: 4, repeatScore: 4, drankAt: '2020-01-01' });
    const newLower = log({ productName: 'new lower', satisfactionScore: 5, correctedScore: 6, repeatScore: 6, drankAt: '2026-01-01' });
    const corrected = log({ productName: 'corrected', satisfactionScore: 6, correctedScore: 5, repeatScore: 4, drankAt: '2021-01-01' });
    expect(highScoreRanking([newLower, oldBest, corrected]).map((item) => item.productName)).toEqual(['corrected', 'old best', 'new lower']);
  });

  it('sorts value ranking by S>A>B>C>D, satisfaction, lower price, then date', () => {
    const a = log({ productName: 'A', valueScore: 'A', satisfactionScore: 6, adoptedMarketPrice: 1000, drankAt: '2026-01-01' });
    const s = log({ productName: 'S', valueScore: 'S', satisfactionScore: 4, adoptedMarketPrice: 5000, drankAt: '2020-01-01' });
    const aCheap = log({ productName: 'A cheap', valueScore: 'A', satisfactionScore: 6, adoptedMarketPrice: 800, drankAt: '2024-01-01' });
    expect(valueRanking([a, s, aCheap]).map((item) => item.productName)).toEqual(['S', 'A cheap', 'A']);
  });
});
