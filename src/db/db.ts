import Dexie, { type Table } from 'dexie';
import type { BackupStatus, MarketPriceCandidate, PostTemplate, SakeImage, SakeLog, UserSettings } from '../types';
import { defaultTemplates, defaultToneSettings } from '../data/templates';

class SakeLogDatabase extends Dexie {
  logs!: Table<SakeLog, string>;
  images!: Table<SakeImage, string>;
  userSettings!: Table<UserSettings, string>;
  templates!: Table<PostTemplate, string>;
  personalityResults!: Table<{ id: string; answers: Record<string, number>; createdAt: string }, string>;
  reviewProfileResults!: Table<{ id: string; mainType: string; subType: string; createdAt: string }, string>;
  backupStatus!: Table<BackupStatus, string>;
  priceCandidates!: Table<MarketPriceCandidate, string>;
  externalSources!: Table<{ id: string; type: string; payload: unknown; createdAt: string }, string>;

  constructor() {
    super('sake-log-db');
    this.version(1).stores({
      logs: 'logId, createdAt, drankAt, alcoholType, productName, makerName, adoptedMarketPrice, valueScore',
      images: 'imageId, logId, imageType, createdAt',
      userSettings: 'id',
      templates: 'templateId, targetSns, updatedAt',
      personalityResults: 'id, createdAt',
      reviewProfileResults: 'id, createdAt',
      backupStatus: 'id',
      priceCandidates: 'id, source, fetchedAt',
      externalSources: 'id, type, createdAt'
    });
  }
}

export const db = new SakeLogDatabase();

export async function ensureSeedData() {
  const settings = await db.userSettings.get('default');
  if (!settings) {
    await db.userSettings.put({
      id: 'default',
      ageConfirmed: false,
      toneSettings: defaultToneSettings,
      backupSettings: { googleDriveReady: false },
      privacySettings: { keepImagesLocal: true }
    });
  }

  if ((await db.templates.count()) === 0) {
    await db.templates.bulkPut(defaultTemplates);
  }

  const backup = await db.backupStatus.get('default');
  if (!backup) {
    await db.backupStatus.put({
      id: 'default',
      googleDriveStatus: 'readyForFuture',
      message: 'ローカル保存中。Google Driveバックアップは後続実装用にサービスを分離済みです。'
    });
  }
}
