import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { BUILD_INFO } from '../config/buildInfo';
import { db } from '../db/db';
import type { PersistedImportedPhoto, SakeImage, SakeLogDraft } from '../types';

export const BACKUP_FORMAT_VERSION = 3;

type BackupMode = 'merge' | 'replace';
type ZipEntries = Record<string, Uint8Array>;
type BackupPhotoMetadata = Omit<PersistedImportedPhoto, 'originalFile' | 'resizedBlob'> & {
  originalPath: string;
  processedPath: string;
  originalMimeType?: string;
  originalLastModified?: number;
};
type BackupDraftMetadata = Omit<SakeLogDraft, 'photos'> & { photos: BackupPhotoMetadata[] };

export interface BackupManifest {
  backupFormatVersion: number;
  appVersion: string;
  dbVersion: number;
  createdAt: string;
  counts: Record<string, number>;
  totalSize: number;
}

export async function exportLocalData() {
  const entries: ZipEntries = {};
  const tables = await readAllTables();
  addJson(entries, 'logs.json', tables.logs);
  addJson(entries, 'price-candidates.json', tables.priceCandidates);
  addJson(entries, 'settings.json', tables.settings);
  addJson(entries, 'templates.json', tables.templates);
  addJson(entries, 'ocr-corrections.json', tables.ocrCorrections);
  addJson(entries, 'label-aliases.json', tables.labelAliases);
  addJson(entries, 'classification-corrections.json', tables.classificationCorrections);
  addJson(entries, 'external-sources.json', tables.externalSources);
  addJson(entries, 'device-validation-results.json', tables.deviceValidationResults);
  addJson(entries, 'product-catalog.json', tables.productCatalog);
  addJson(entries, 'reference-images.json', tables.referenceImages);
  addJson(entries, 'identification-runs.json', tables.identificationRuns);
  addJson(entries, 'learning-events.json', tables.learningEvents);
  addJson(entries, 'product-aliases.json', tables.productAliases);
  addJson(entries, 'product-barcodes.json', tables.productBarcodes);
  addJson(entries, 'visual-features.json', tables.visualFeatures);
  addJson(entries, 'identification-evidence.json', tables.identificationEvidence);
  addJson(entries, 'identification-settings.json', tables.identificationSettings);
  addJson(entries, 'personality-results.json', tables.personalityResults);
  addJson(entries, 'review-profile-results.json', tables.reviewProfileResults);
  addJson(entries, 'backup-status.json', tables.backupStatus);

  const imageMetadata = [];
  for (const image of tables.images) {
    const originalPath = `images/original/${image.imageId}`;
    entries[originalPath] = new Uint8Array(await image.originalBlob.arrayBuffer());
    let processedPath: string | undefined;
    if (image.processedBlob) {
      processedPath = `images/processed/${image.imageId}`;
      entries[processedPath] = new Uint8Array(await image.processedBlob.arrayBuffer());
    }
    imageMetadata.push({ ...withoutBlobFields(image), originalPath, processedPath });
  }
  addJson(entries, 'images.json', imageMetadata);

  const draftMetadata = [];
  for (const draft of tables.drafts) {
    const photos = [];
    for (const photo of draft.photos) {
      const originalPath = `drafts/${draft.id}/original/${photo.id}`;
      const processedPath = `drafts/${draft.id}/processed/${photo.id}`;
      entries[originalPath] = new Uint8Array(await photo.originalFile.arrayBuffer());
      entries[processedPath] = new Uint8Array(await photo.resizedBlob.arrayBuffer());
      photos.push({ ...withoutPhotoBlobs(photo), originalPath, processedPath });
    }
    draftMetadata.push({ ...draft, photos });
  }
  addJson(entries, 'drafts.json', draftMetadata);

  const checksums: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(entries)) checksums[path] = await sha256(bytes);
  addJson(entries, 'checksums.json', checksums);
  const manifest: BackupManifest = {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    appVersion: BUILD_INFO.version,
    dbVersion: db.verno,
    createdAt: new Date().toISOString(),
    counts: {
      logs: tables.logs.length,
      images: tables.images.length,
      drafts: tables.drafts.length,
      priceCandidates: tables.priceCandidates.length,
      ocrCorrections: tables.ocrCorrections.length,
      classificationCorrections: tables.classificationCorrections.length,
      productCatalog: tables.productCatalog.length,
      referenceImages: tables.referenceImages.length,
      identificationEvidence: tables.identificationEvidence.length,
      visualFeatures: tables.visualFeatures.length
    },
    totalSize: Object.values(entries).reduce((sum, value) => sum + value.byteLength, 0)
  };
  addJson(entries, 'manifest.json', manifest);
  const blob = new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' });
  await db.backupStatus.put({
    id: 'default',
    lastLocalExportAt: manifest.createdAt,
    googleDriveStatus: 'readyForFuture',
    message: '写真を含む完全バックアップZIPを書き出しました。'
  });
  return blob;
}

export async function inspectBackup(blob: Blob) {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const manifest = readJson<BackupManifest>(entries, 'manifest.json');
  if (manifest.backupFormatVersion > BACKUP_FORMAT_VERSION) throw new Error('このバックアップは新しい形式です。アプリを更新してください。');
  const checksums = readJson<Record<string, string>>(entries, 'checksums.json');
  for (const [path, checksum] of Object.entries(checksums)) {
    const bytes = entries[path];
    if (!bytes || await sha256(bytes) !== checksum) throw new Error(`チェックサムが一致しません: ${path}`);
  }
  return { entries, manifest };
}

export async function restoreLocalData(blob: Blob, mode: BackupMode) {
  const { entries, manifest } = await inspectBackup(blob);
  const logs = readJson<Parameters<typeof db.logs.bulkPut>[0]>(entries, 'logs.json');
  const priceCandidates = readJson<Parameters<typeof db.priceCandidates.bulkPut>[0]>(entries, 'price-candidates.json');
  const settings = readJson<Parameters<typeof db.userSettings.bulkPut>[0]>(entries, 'settings.json');
  const templates = readJson<Parameters<typeof db.templates.bulkPut>[0]>(entries, 'templates.json');
  const corrections = readJson<Parameters<typeof db.ocrCorrections.bulkPut>[0]>(entries, 'ocr-corrections.json');
  const aliases = readJson<Parameters<typeof db.labelAliases.bulkPut>[0]>(entries, 'label-aliases.json');
  const classifications = readJson<Parameters<typeof db.classificationCorrections.bulkPut>[0]>(entries, 'classification-corrections.json');
  const externalSources = readJson<Parameters<typeof db.externalSources.bulkPut>[0]>(entries, 'external-sources.json');
  const validationResults = readJson<Parameters<typeof db.deviceValidationResults.bulkPut>[0]>(entries, 'device-validation-results.json');
  const personalityResults = readOptionalJson<Parameters<typeof db.personalityResults.bulkPut>[0]>(entries, 'personality-results.json', []);
  const reviewProfileResults = readOptionalJson<Parameters<typeof db.reviewProfileResults.bulkPut>[0]>(entries, 'review-profile-results.json', []);
  const backupStatus = readOptionalJson<Parameters<typeof db.backupStatus.bulkPut>[0]>(entries, 'backup-status.json', []);
  const productCatalog = readOptionalJson<Parameters<typeof db.productCatalog.bulkPut>[0]>(entries, 'product-catalog.json', []);
  const referenceImages = readOptionalJson<Parameters<typeof db.referenceImages.bulkPut>[0]>(entries, 'reference-images.json', []);
  const identificationRuns = readOptionalJson<Parameters<typeof db.identificationRuns.bulkPut>[0]>(entries, 'identification-runs.json', []);
  const learningEvents = readOptionalJson<Parameters<typeof db.learningEvents.bulkPut>[0]>(entries, 'learning-events.json', []);
  const productAliases = readOptionalJson<Parameters<typeof db.productAliases.bulkPut>[0]>(entries, 'product-aliases.json', []);
  const productBarcodes = readOptionalJson<Parameters<typeof db.productBarcodes.bulkPut>[0]>(entries, 'product-barcodes.json', []);
  const visualFeatures = readOptionalJson<Parameters<typeof db.visualFeatures.bulkPut>[0]>(entries, 'visual-features.json', []);
  const identificationEvidence = readOptionalJson<Parameters<typeof db.identificationEvidence.bulkPut>[0]>(entries, 'identification-evidence.json', []);
  const identificationSettings = readOptionalJson<Parameters<typeof db.identificationSettings.bulkPut>[0]>(entries, 'identification-settings.json', []);
  const imageMetadata = readJson<Array<Record<string, unknown> & { originalPath: string; processedPath?: string }>>(entries, 'images.json');
  const draftMetadata = readJson<BackupDraftMetadata[]>(entries, 'drafts.json');
  const images = imageMetadata.map((item) => hydrateImage(item, entries));
  const drafts = draftMetadata.map((draft) => hydrateDraft(draft, entries));

  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      for (const table of db.tables) await table.clear();
    }
    await db.logs.bulkPut(logs);
    await db.images.bulkPut(images);
    await db.priceCandidates.bulkPut(priceCandidates);
    await db.userSettings.bulkPut(settings);
    await db.templates.bulkPut(templates);
    await db.ocrCorrections.bulkPut(corrections);
    await db.labelAliases.bulkPut(aliases);
    await db.classificationCorrections.bulkPut(classifications);
    await db.externalSources.bulkPut(externalSources);
    await db.deviceValidationResults.bulkPut(validationResults);
    await db.personalityResults.bulkPut(personalityResults);
    await db.reviewProfileResults.bulkPut(reviewProfileResults);
    await db.backupStatus.bulkPut(backupStatus);
    await db.productCatalog.bulkPut(productCatalog);
    await db.referenceImages.bulkPut(referenceImages);
    await db.identificationRuns.bulkPut(identificationRuns);
    await db.learningEvents.bulkPut(learningEvents);
    await db.productAliases.bulkPut(productAliases);
    await db.productBarcodes.bulkPut(productBarcodes);
    await db.visualFeatures.bulkPut(visualFeatures);
    await db.identificationEvidence.bulkPut(identificationEvidence);
    await db.identificationSettings.bulkPut(identificationSettings);
    await db.drafts.bulkPut(drafts);
  });
  return manifest;
}

async function readAllTables() {
  const [logs, images, drafts, priceCandidates, settings, templates, ocrCorrections, labelAliases, classificationCorrections, externalSources, deviceValidationResults, personalityResults, reviewProfileResults, backupStatus, productCatalog, referenceImages, identificationRuns, learningEvents, productAliases, productBarcodes, visualFeatures, identificationEvidence, identificationSettings] = await Promise.all([
    db.logs.toArray(), db.images.toArray(), db.drafts.toArray(), db.priceCandidates.toArray(), db.userSettings.toArray(), db.templates.toArray(),
    db.ocrCorrections.toArray(), db.labelAliases.toArray(), db.classificationCorrections.toArray(), db.externalSources.toArray(), db.deviceValidationResults.toArray(),
    db.personalityResults.toArray(), db.reviewProfileResults.toArray(), db.backupStatus.toArray(),
    db.productCatalog.toArray(), db.referenceImages.toArray(), db.identificationRuns.toArray(), db.learningEvents.toArray(),
    db.productAliases.toArray(), db.productBarcodes.toArray(), db.visualFeatures.toArray(), db.identificationEvidence.toArray(), db.identificationSettings.toArray()
  ]);
  return { logs, images, drafts, priceCandidates, settings, templates, ocrCorrections, labelAliases, classificationCorrections, externalSources, deviceValidationResults, personalityResults, reviewProfileResults, backupStatus, productCatalog, referenceImages, identificationRuns, learningEvents, productAliases, productBarcodes, visualFeatures, identificationEvidence, identificationSettings };
}

function addJson(entries: ZipEntries, path: string, value: unknown) {
  entries[path] = strToU8(JSON.stringify(value, null, 2));
}

function readJson<T>(entries: ZipEntries, path: string): T {
  const bytes = entries[path];
  if (!bytes) throw new Error(`バックアップに必要なファイルがありません: ${path}`);
  return JSON.parse(strFromU8(bytes)) as T;
}

function readOptionalJson<T>(entries: ZipEntries, path: string, fallback: T): T {
  return entries[path] ? readJson<T>(entries, path) : fallback;
}

function withoutBlobFields(image: SakeImage) {
  const metadata: Partial<SakeImage> = { ...image };
  delete metadata.originalBlob;
  delete metadata.processedBlob;
  return metadata;
}

function withoutPhotoBlobs(photo: PersistedImportedPhoto) {
  const metadata: Partial<PersistedImportedPhoto> = { ...photo };
  delete metadata.originalFile;
  delete metadata.resizedBlob;
  return { ...metadata, originalMimeType: photo.originalFile.type, originalLastModified: photo.originalFile.lastModified };
}

function hydrateImage(item: Record<string, unknown> & { originalPath: string; processedPath?: string }, entries: ZipEntries): SakeImage {
  const { originalPath, processedPath, ...metadata } = item;
  return {
    ...(metadata as unknown as SakeImage),
    originalBlob: new Blob([entries[originalPath] as BlobPart], { type: String(item.mimeType ?? 'application/octet-stream') }),
    processedBlob: processedPath ? new Blob([entries[processedPath] as BlobPart], { type: 'image/jpeg' }) : undefined
  };
}

function hydrateDraft(draft: BackupDraftMetadata, entries: ZipEntries): SakeLogDraft {
  return {
    ...draft,
    photos: draft.photos.map((photo) => {
      const { originalPath, processedPath, ...metadata } = photo;
      const fileName = String(photo.fileName ?? 'photo');
      const mimeType = String(photo.originalMimeType ?? 'application/octet-stream');
      return {
        ...(metadata as unknown as PersistedImportedPhoto),
        originalFile: new File([entries[originalPath] as BlobPart], fileName, { type: mimeType, lastModified: Number(photo.originalLastModified ?? Date.now()) }),
        resizedBlob: new Blob([entries[processedPath] as BlobPart], { type: 'image/jpeg' })
      };
    })
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
