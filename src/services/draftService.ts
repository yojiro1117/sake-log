import { db } from '../db/db';
import type { ImportedPhotoDraft, PersistedImportedPhoto, SakeLogDraft } from '../types';

export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_DEBOUNCE_MS = 750;

export function serializePhotos(photos: ImportedPhotoDraft[]): PersistedImportedPhoto[] {
  return photos.map((photo) => ({
    id: photo.id,
    fileName: photo.fileName,
    originalFile: photo.originalFile,
    resizedBlob: photo.resizedBlob,
    capturedAt: photo.capturedAt,
    imageHash: photo.imageHash,
    width: photo.width,
    height: photo.height,
    ocr: photo.ocr,
    candidates: photo.candidates,
    status: photo.status,
    message: photo.message,
    imageType: photo.imageType,
    classification: photo.classification,
    sortOrder: photo.sortOrder
  }));
}

export function hydratePhotos(photos: PersistedImportedPhoto[]): ImportedPhotoDraft[] {
  return photos.map((photo) => ({ ...photo, previewUrl: URL.createObjectURL(photo.resizedBlob) }));
}

export function isValidDraft(value: unknown): value is SakeLogDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<SakeLogDraft>;
  return Boolean(
    draft.id &&
      draft.formState &&
      typeof draft.formState === 'object' &&
      Array.isArray(draft.photos) &&
      draft.updatedAt &&
      ['editing', 'paused', 'ready'].includes(draft.status ?? '')
  );
}

export async function saveDraft(draft: SakeLogDraft) {
  await db.drafts.put({ ...draft, schemaVersion: DRAFT_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
}

export async function loadDraft(id: string) {
  const draft = await db.drafts.get(id);
  if (!isValidDraft(draft)) return { draft: undefined, error: draft ? 'ドラフトの形式が破損しています。' : undefined };
  return { draft };
}

export async function deleteDraft(id: string) {
  await db.drafts.delete(id);
}

export function draftProgress(formState: Record<string, unknown>) {
  const fields = ['productName', 'makerName', 'alcoholType', 'volume', 'abv', 'drankAt', 'memo'];
  const completed = fields.filter((key) => Boolean(formState[key])).length;
  return Math.round((completed / fields.length) * 100);
}

export function createDebouncedDraftWriter(write: () => Promise<void>, delay = DRAFT_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void write(), delay);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await write();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  };
}
