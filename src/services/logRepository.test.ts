import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { findDuplicateLogs, saveLogTransaction } from './logRepository';
import type { SakeImage, SakeLog } from '../types';

const baseLog = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  drankAt: '2026-01-01',
  alcoholType: 'sake',
  productName: '獺祭',
  makerName: '旭酒造',
  volume: 720,
  baseScores: {},
  satisfactionScore: 5,
  repeatScore: 5,
  foodMatchScore: 4,
  correctedScore: 5,
  correctionReason: '',
  tags: [],
  userConfirmed: true
} satisfies Partial<SakeLog>;

function log(id: string): SakeLog {
  return { ...baseLog, logId: id } as SakeLog;
}

function image(logId: string, hash = 'hash-1'): SakeImage {
  return {
    imageId: crypto.randomUUID(),
    logId,
    imageType: 'frontLabel',
    originalBlob: new Blob(['image']),
    backgroundMode: 'original',
    createdAt: '2026-01-01T00:00:00.000Z',
    imageHash: hash
  };
}

afterEach(async () => {
  await db.transaction('rw', db.logs, db.images, db.priceCandidates, async () => {
    await db.logs.clear();
    await db.images.clear();
    await db.priceCandidates.clear();
  });
});

describe('logRepository', () => {
  it('saves logs, images and price candidates in one transaction', async () => {
    await saveLogTransaction({ log: log('log-1'), images: [image('log-1')], priceCandidates: [] });
    await expect(db.logs.count()).resolves.toBe(1);
    await expect(db.images.count()).resolves.toBe(1);
  });

  it('rolls back the log when image save fails', async () => {
    const duplicateImage = image('log-2', 'dup');
    await db.images.add(duplicateImage);
    await expect(saveLogTransaction({ log: log('log-2'), images: [{ ...duplicateImage, logId: 'log-2' }], priceCandidates: [] })).rejects.toThrow();
    await expect(db.logs.where('logId').equals('log-2').count()).resolves.toBe(0);
  });

  it('detects duplicate image hash', async () => {
    await saveLogTransaction({ log: log('log-3'), images: [image('log-3', 'same-image')], priceCandidates: [] });
    const duplicates = await findDuplicateLogs({ imageHashes: ['same-image'], productName: '別銘柄', drankAt: '2026-01-02' });
    expect(duplicates).toHaveLength(1);
  });
});
