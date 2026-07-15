import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { confidenceLabel, confidenceLevel, scoreCandidate } from './confidenceService';
import { createDebouncedDraftWriter, isValidDraft, loadDraft, saveDraft } from './draftService';
import { learningCandidates, recordClassificationCorrection, recordOcrCorrection } from './ocrLearning';
import { classifyPhoto } from './photoClassification';

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([db.drafts.clear(), db.ocrCorrections.clear(), db.classificationCorrections.clear()]);
});

describe('quality features', () => {
  it('calculates evidence-based confidence and never marks a candidate confirmed', () => {
    const score = scoreCandidate({ ocrConfidence: 0.96, productMatch: 88, makerMatch: 72, alcoholTypeMatch: 100, volumeMatch: 80 });
    expect(score.totalConfidence).toBeGreaterThanOrEqual(80);
    expect(score.requiresConfirmation).toBe(true);
    expect(confidenceLevel(90)).toBe('high');
    expect(confidenceLabel(70)).toBe('要確認');
    expect(confidenceLabel(69)).toBe('手動確認推奨');
  });

  it('classifies receipt and back label from independent evidence', () => {
    expect(classifyPhoto({ ocrText: '店名 TEL 小計 税込 合計 2,400円', width: 900, height: 1600 }).type).toBe('receipt');
    expect(classifyPhoto({ ocrText: '原材料 米 米こうじ 内容量 720ml アルコール分 製造者 注意', width: 1200, height: 900 }).type).toBe('backLabel');
  });

  it('persists classification corrections and uses them on the next classification', async () => {
    await recordClassificationCorrection('glass-test', 'other', 'glass', 'classification-event-1');
    const corrections = await db.classificationCorrections.toArray();
    const result = classifyPhoto({ ocrText: 'glass-test', width: 800, height: 800, corrections });
    expect(result.alternatives.some((item) => item.type === 'glass')).toBe(true);
  });

  it('stores OCR corrections locally and raises a grounded candidate without auto-confirming', async () => {
    await recordOcrCorrection({ observedText: '黒霧鳥', productName: '黒霧島', makerName: '霧島酒造', alcoholType: 'shochu', learningEventId: 'ocr-event-1' });
    const candidates = await learningCandidates('ラベル 黒霧鳥 900ml');
    expect(candidates[0]).toMatchObject({ productName: '黒霧島', requiresConfirmation: true });
    expect(candidates[0].matchReasons).toContain('過去の修正履歴');
  });

  it('debounces draft writes and restores a valid draft', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => undefined);
    const writer = createDebouncedDraftWriter(write, 750);
    writer.schedule();
    writer.schedule();
    await vi.advanceTimersByTimeAsync(749);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    const draft = {
      id: 'draft-1', source: 'manual' as const, formState: { productName: '獺祭' }, photos: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'editing' as const, schemaVersion: 1
    };
    await saveDraft(draft);
    expect((await loadDraft('draft-1')).draft?.formState.productName).toBe('獺祭');
    expect(isValidDraft({ id: 'broken' })).toBe(false);
  });

  it('keeps database migration version and new stores without deleting existing tables', () => {
    expect(db.verno).toBe(5);
    expect(db.tables.map((table) => table.name)).toEqual(expect.arrayContaining(['logs', 'images', 'drafts', 'ocrCorrections', 'labelAliases', 'classificationCorrections']));
  });
});
