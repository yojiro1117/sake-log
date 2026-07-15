import Dexie, { type Table } from 'dexie';
import type {
  BackupStatus,
  ClassificationCorrection,
  DeviceValidationResult,
  LabelAliasEntry,
  MarketPriceCandidate,
  OcrCorrectionEntry,
  PostTemplate,
  SakeImage,
  SakeLog,
  SakeLogDraft,
  UserSettings
} from '../types';
import { defaultTemplates, defaultToneSettings } from '../data/templates';

export class SakeLogDatabase extends Dexie {
  logs!: Table<SakeLog, string>;
  images!: Table<SakeImage, string>;
  userSettings!: Table<UserSettings, string>;
  templates!: Table<PostTemplate, string>;
  personalityResults!: Table<{ id: string; answers: Record<string, number>; createdAt: string }, string>;
  reviewProfileResults!: Table<{ id: string; mainType: string; subType: string; createdAt: string }, string>;
  backupStatus!: Table<BackupStatus, string>;
  priceCandidates!: Table<MarketPriceCandidate, string>;
  externalSources!: Table<{ id: string; type: string; payload: unknown; createdAt: string }, string>;
  drafts!: Table<SakeLogDraft, string>;
  ocrCorrections!: Table<OcrCorrectionEntry, string>;
  labelAliases!: Table<LabelAliasEntry, string>;
  classificationCorrections!: Table<ClassificationCorrection, string>;
  deviceValidationResults!: Table<DeviceValidationResult, string>;

  constructor(databaseName = 'sake-log-db') {
    super(databaseName);

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

    this.version(2)
      .stores({
        logs:
          'logId, createdAt, updatedAt, drankAt, capturedAt, alcoholType, productName, makerName, adoptedMarketPrice, valueScore, selectedMarketPriceCandidateId, importMode',
        images:
          'imageId, logId, imageType, createdAt, capturedAt, imageHash, createdFromImport, sortOrder, fileName, mimeType',
        userSettings: 'id',
        templates: 'templateId, targetSns, updatedAt',
        personalityResults: 'id, createdAt',
        reviewProfileResults: 'id, createdAt',
        backupStatus: 'id',
        priceCandidates: 'id, logId, source, fetchedAt, recommended, matchScore',
        externalSources: 'id, type, createdAt'
      })
      .upgrade(async (tx) => {
        const logs = tx.table<SakeLog, string>('logs');
        await logs.toCollection().modify((log) => {
          if (!log.capturedAt && (log as SakeLog & { photoTakenAt?: string }).photoTakenAt) {
            log.capturedAt = (log as SakeLog & { photoTakenAt?: string }).photoTakenAt;
          }
          if (log.generatedTexts && typeof log.generatedTexts !== 'object') log.generatedTexts = undefined;
          log.selectedMarketPriceCandidateId ??= null;
        });

        const images = tx.table<SakeImage, string>('images');
        await images.toCollection().modify((image) => {
          image.imageType ??= 'frontLabel';
          image.createdFromImport ??= false;
          image.sortOrder ??= 0;
        });
      });

    this.version(3)
      .stores({
        logs:
          'logId, createdAt, updatedAt, drankAt, capturedAt, alcoholType, productName, makerName, adoptedMarketPrice, valueScore, selectedMarketPriceCandidateId, importMode, status',
        images:
          'imageId, logId, imageType, createdAt, capturedAt, imageHash, createdFromImport, sortOrder, fileName, mimeType',
        userSettings: 'id',
        templates: 'templateId, targetSns, updatedAt',
        personalityResults: 'id, createdAt',
        reviewProfileResults: 'id, createdAt',
        backupStatus: 'id',
        priceCandidates: 'id, logId, source, fetchedAt, recommended, matchScore',
        externalSources: 'id, type, createdAt',
        drafts: 'id, updatedAt, status, source',
        ocrCorrections: 'id, observedText, correctedProductName, lastUsedAt',
        labelAliases: 'id, alias, productName',
        classificationCorrections: 'id, fingerprint, correctedType, updatedAt'
      })
      .upgrade(async (tx) => {
        await tx.table<SakeLog, string>('logs').toCollection().modify((log) => {
          log.status ??= 'complete';
        });
      });

    this.version(4)
      .stores({
        logs:
          'logId, createdAt, updatedAt, drankAt, capturedAt, alcoholType, productName, makerName, adoptedMarketPrice, valueScore, selectedMarketPriceCandidateId, importMode, status, saveOperationId',
        images:
          'imageId, logId, imageType, createdAt, capturedAt, imageHash, createdFromImport, sortOrder, fileName, mimeType',
        userSettings: 'id',
        templates: 'templateId, targetSns, updatedAt',
        personalityResults: 'id, createdAt',
        reviewProfileResults: 'id, createdAt',
        backupStatus: 'id',
        priceCandidates: 'id, logId, source, fetchedAt, recommended, matchScore',
        externalSources: 'id, type, createdAt',
        drafts: 'id, updatedAt, status, source, revision',
        ocrCorrections: 'id, observedText, correctedProductName, lastUsedAt',
        labelAliases: 'id, alias, productName',
        classificationCorrections: 'id, fingerprint, correctedType, updatedAt',
        deviceValidationResults: 'id, updatedAt'
      })
      .upgrade(async (tx) => {
        await tx.table<SakeLogDraft, string>('drafts').toCollection().modify((draft) => {
          draft.revision ??= 0;
        });
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
      message: 'ローカル保存中です。Google Driveバックアップは後続実装で追加予定です。'
    });
  }
}
