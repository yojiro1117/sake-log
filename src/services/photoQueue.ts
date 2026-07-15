import type { ImportedPhotoDraft } from '../types';

export function mergePhotoDraft(current: ImportedPhotoDraft[], incoming: ImportedPhotoDraft) {
  const key = incoming.fileKey ?? incoming.imageHash ?? incoming.id;
  const index = current.findIndex((item) => (item.fileKey ?? item.imageHash ?? item.id) === key);
  if (index < 0) return [...current, incoming].sort((a, b) => a.sortOrder - b.sortOrder);
  const next = [...current];
  const previous = next[index];
  next[index] = {
    ...previous,
    ...incoming,
    imageType: previous.classificationConfirmed ? previous.imageType : incoming.imageType,
    classificationConfirmed: previous.classificationConfirmed ?? incoming.classificationConfirmed
  };
  return next.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function mergePhotoDrafts(current: ImportedPhotoDraft[], incoming: ImportedPhotoDraft[]) {
  return incoming.reduce(mergePhotoDraft, current);
}

export function uniqueImportFiles<T extends { name: string; size: number; lastModified: number }>(files: T[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
