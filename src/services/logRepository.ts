import { db } from '../db/db';
import type { MarketPriceCandidate, SakeImage, SakeLog } from '../types';

export interface SaveLogPayload {
  log: SakeLog;
  images: SakeImage[];
  priceCandidates: MarketPriceCandidate[];
}

export async function findDuplicateLogs(payload: {
  imageHashes: string[];
  productName: string;
  drankAt?: string;
  volume?: number;
  makerName?: string;
}) {
  const byImage = payload.imageHashes.length
    ? await db.images.where('imageHash').anyOf(payload.imageHashes).toArray()
    : [];
  const imageLogIds = new Set(byImage.map((image) => image.logId).filter(Boolean) as string[]);
  const logs = await db.logs.toArray();
  const text = (value?: string) => value?.trim().toLowerCase() ?? '';

  return logs.filter((log) => {
    if (imageLogIds.has(log.logId)) return true;
    return (
      text(log.productName) === text(payload.productName) &&
      text(log.makerName) === text(payload.makerName) &&
      (log.drankAt ?? '') === (payload.drankAt ?? '') &&
      (log.volume ?? 0) === (payload.volume ?? 0)
    );
  });
}

export async function saveLogTransaction({ log, images, priceCandidates }: SaveLogPayload) {
  await db.transaction('rw', db.logs, db.images, db.priceCandidates, async () => {
    await db.logs.add(log);
    if (images.length) await db.images.bulkAdd(images.map((image) => ({ ...image, logId: log.logId })));
    if (priceCandidates.length) {
      await db.priceCandidates.bulkAdd(priceCandidates.map((candidate) => ({ ...candidate, logId: log.logId })));
    }
  });
}
