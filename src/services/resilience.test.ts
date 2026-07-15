import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { db } from '../db/db';
import { builtInAlcoholProductCatalog } from '../data/alcoholProductCatalog';
import type { ImportedPhotoDraft, SakeLog } from '../types';
import { exportLocalData, inspectBackup, restoreLocalData } from './backupService';
import { isDraftDirty, loadDraft, saveDraft } from './draftService';
import { saveLogTransaction } from './logRepository';
import { recordClassificationCorrection, recordOcrCorrection } from './ocrLearning';
import { aggregatePhotoOcr } from './ocrAggregation';
import { mergePhotoDraft, uniqueImportFiles } from './photoQueue';
import { createInitialFormState } from './recordForm';

const baseLog = (id: string, operation: string): SakeLog => ({
  logId: id, saveOperationId: operation, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), alcoholType: 'sake',
  productName: 'テスト酒', baseScores: {}, satisfactionScore: 4, repeatScore: 4, foodMatchScore: 4, correctedScore: 4,
  correctionReason: '', tags: [], userConfirmed: true, status: 'complete'
});

function photo(id: string, status: ImportedPhotoDraft['status'], text = ''): ImportedPhotoDraft {
  const file = new File([id], `${id}.jpg`, { type: 'image/jpeg', lastModified: 1 });
  return {
    id, fileName: file.name, originalFile: file, resizedBlob: file, previewUrl: `blob:${id}`, imageHash: id, ocr: {
      text, confidence: text ? 0.8 : 0, engine: text ? 'tesseract' : 'none', status: text ? 'success' : 'empty', message: ''
    }, candidates: [], status, imageType: 'frontLabel', sortOrder: Number(id.replace(/\D/g, '')) || 0, fileKey: `${file.name}|${file.size}|${file.lastModified}`
  };
}

afterEach(async () => {
  for (const table of db.tables) await table.clear();
});

describe('resilient data flows', () => {
  it('merges retry results without losing successful photos or adding duplicates', () => {
    const successful = Array.from({ length: 8 }, (_, index) => photo(`p${index}`, 'success', `text${index}`));
    const failed = photo('p8', 'failed');
    const retried = { ...failed, status: 'success' as const, ocr: { ...failed.ocr, text: 'recovered', status: 'success' as const } };
    const merged = mergePhotoDraft([...successful, failed], retried);
    expect(merged).toHaveLength(9);
    expect(merged.slice(0, 8).map((item) => item.ocr.text)).toEqual(successful.map((item) => item.ocr.text));
    expect(mergePhotoDraft(merged, retried)).toHaveLength(9);
    expect(uniqueImportFiles([retried.originalFile, retried.originalFile])).toHaveLength(1);
  });

  it('keeps draft createdAt and rejects an older async revision', async () => {
    const initial = createInitialFormState('sake');
    expect(isDraftDirty({ ...initial, makerName: '蔵元' } as unknown as Record<string, unknown>, initial as unknown as Record<string, unknown>)).toBe(true);
    const draft = { id: 'draft', source: 'manual' as const, formState: { makerName: 'first' }, photos: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', status: 'editing' as const, schemaVersion: 1, revision: 2 };
    await saveDraft(draft);
    await saveDraft({ ...draft, formState: { makerName: 'stale' }, revision: 1, createdAt: 'changed' });
    const restored = (await loadDraft('draft')).draft!;
    expect(restored.formState.makerName).toBe('first');
    expect(restored.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('makes core save idempotent by saveOperationId', async () => {
    const first = await saveLogTransaction({ log: baseLog('log-a', 'operation-1'), images: [], priceCandidates: [] });
    const second = await saveLogTransaction({ log: baseLog('log-b', 'operation-1'), images: [], priceCandidates: [] });
    expect(first).toEqual({ logId: 'log-a', created: true });
    expect(second).toEqual({ logId: 'log-a', created: false });
    await expect(db.logs.count()).resolves.toBe(1);
  });

  it('records OCR and classification learning once per final save event', async () => {
    const input = { observedText: '黒霧鳥', productName: '黒霧島', alcoholType: 'shochu' as const, learningEventId: 'log|hash|product' };
    await recordOcrCorrection(input);
    await recordOcrCorrection(input);
    expect((await db.ocrCorrections.toArray())[0].acceptedCount).toBe(1);
    await recordClassificationCorrection('fingerprint', 'other', 'bottle', 'log|hash|classification');
    await recordClassificationCorrection('fingerprint', 'other', 'bottle', 'log|hash|classification');
    expect((await db.classificationCorrections.toArray())[0].acceptedCount).toBe(1);
  });

  it('combines evidence from multiple photos', () => {
    const front = photo('p1', 'success', '獺祭');
    front.candidates = [{ productName: '獺祭', alcoholType: 'sake', confidence: 'high', matchReasons: ['銘柄名一致'], totalConfidence: 90, requiresConfirmation: true }];
    const back = photo('p2', 'success', '旭酒造 内容量720ml アルコール分16%');
    back.imageType = 'backLabel';
    back.candidates = [{ productName: '獺祭', makerName: '旭酒造', alcoholType: 'sake', volume: 720, abv: 16, confidence: 'high', matchReasons: ['蔵元名一致'], totalConfidence: 88, requiresConfirmation: true }];
    const result = aggregatePhotoOcr([front, back]);
    expect(result.candidates[0]).toMatchObject({ productName: '獺祭 純米大吟醸45', makerName: '旭酒造' });
    expect(result.sources.volume).toContain('裏ラベル');
  });

  it('backs up and restores images, drafts and checksums', async () => {
    await db.logs.put(baseLog('log-backup', 'operation-backup'));
    await db.images.put({ imageId: 'image-1', logId: 'log-backup', imageType: 'frontLabel', originalBlob: new Blob(['original']), processedBlob: new Blob(['processed']), backgroundMode: 'original', createdAt: new Date().toISOString() });
    const draftPhoto = photo('draft-photo', 'success', 'label');
    await db.drafts.put({ id: 'draft-backup', source: 'photo-import', formState: { productName: '途中' }, photos: [draftPhoto], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'editing', schemaVersion: 1, revision: 1 });
    const backup = await exportLocalData();
    const inspection = await inspectBackup(backup);
    expect(inspection.manifest.counts).toMatchObject({ logs: 1, images: 1, drafts: 1 });
    await db.logs.clear(); await db.images.clear(); await db.drafts.clear();
    await restoreLocalData(backup, 'merge');
    await expect(db.logs.count()).resolves.toBe(1);
    expect((await db.images.get('image-1'))?.originalBlob.size).toBeGreaterThan(0);
    expect((await db.drafts.get('draft-backup'))?.photos).toHaveLength(1);
  });

  it('rejects a backup whose checksummed payload was changed', async () => {
    await db.logs.put(baseLog('log-corrupt', 'operation-corrupt'));
    const backup = await exportLocalData();
    const entries = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    entries['logs.json'] = strToU8('[]');
    const corrupted = new Blob([zipSync(entries) as BlobPart], { type: 'application/zip' });
    await expect(inspectBackup(corrupted)).rejects.toThrow(/checksums|チェックサム/i);
  });

  it('includes auxiliary tables and supports replace restore', async () => {
    await db.logs.put(baseLog('log-replace', 'operation-replace'));
    await db.personalityResults.put({ id: 'personality', answers: { a: 4 }, createdAt: '2026-01-01' });
    await db.reviewProfileResults.put({ id: 'review', mainType: 'taste', subType: 'food', createdAt: '2026-01-01' });
    await db.productCatalog.put({ ...builtInAlcoholProductCatalog[0], source: 'user-confirmed', userConfirmed: true });
    await db.productAliases.put({ id:'alias-1', productId:builtInAlcoholProductCatalog[0].productId, alias:'confirmed alias', kind:'user-confirmed', confirmed:true, updatedAt:'2026-01-01' });
    await db.identificationEvidence.put({ id:'evidence-1', runId:'run-1', field:'product', value:'confirmed', sourceImageId:'image-1', method:'ocr', confidence:0.9, createdAt:'2026-01-01' });
    const backup = await exportLocalData();
    await db.logs.put(baseLog('log-remove', 'operation-remove'));
    await restoreLocalData(backup, 'replace');
    await expect(db.logs.count()).resolves.toBe(1);
    await expect(db.logs.get('log-remove')).resolves.toBeUndefined();
    await expect(db.personalityResults.get('personality')).resolves.toBeTruthy();
    await expect(db.reviewProfileResults.get('review')).resolves.toBeTruthy();
    await expect(db.productCatalog.get(builtInAlcoholProductCatalog[0].productId)).resolves.toMatchObject({ userConfirmed: true });
    await expect(db.productAliases.get('alias-1')).resolves.toMatchObject({ confirmed:true });
    await expect(db.identificationEvidence.get('evidence-1')).resolves.toMatchObject({ method:'ocr' });
  });
});
