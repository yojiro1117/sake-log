import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { SakeLogDatabase } from './db';

const names: string[] = [];

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('database migration', () => {
  it('preserves version 1 logs and images through version 5', async () => {
    const name = `migration-v1-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      logs: 'logId, createdAt, drankAt, alcoholType, productName, makerName, adoptedMarketPrice, valueScore',
      images: 'imageId, logId, imageType, createdAt',
      userSettings: 'id', templates: 'templateId', personalityResults: 'id', reviewProfileResults: 'id',
      backupStatus: 'id', priceCandidates: 'id', externalSources: 'id'
    });
    await legacy.open();
    await legacy.table('logs').put({ logId: 'legacy-log', createdAt: '2020-01-01', alcoholType: 'sake', productName: 'legacy', generatedTexts: 'invalid' });
    await legacy.table('images').put({ imageId: 'legacy-image', logId: 'legacy-log', originalBlob: new Blob(['image']), createdAt: '2020-01-01' });
    legacy.close();

    const migrated = new SakeLogDatabase(name);
    await migrated.open();
    const log = await migrated.logs.get('legacy-log');
    const image = await migrated.images.get('legacy-image');
    expect(migrated.verno).toBe(5);
    expect(log).toMatchObject({ logId: 'legacy-log', status: 'complete', selectedMarketPriceCandidateId: null });
    expect(log?.generatedTexts).toBeUndefined();
    expect(image).toMatchObject({ imageId: 'legacy-image', imageType: 'frontLabel', sortOrder: 0, createdFromImport: false });
    migrated.close();
  });
});
