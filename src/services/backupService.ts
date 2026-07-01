import { db } from '../db/db';

export async function exportLocalData() {
  const [logs, templates, settings] = await Promise.all([
    db.logs.toArray(),
    db.templates.toArray(),
    db.userSettings.get('default')
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'SAKEログ local backup v1',
    googleDriveFuturePath: 'SAKEログ_Backup/logs/sake_logs.json',
    logs,
    templates,
    settings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  await db.backupStatus.put({
    id: 'default',
    lastLocalExportAt: payload.exportedAt,
    googleDriveStatus: 'readyForFuture',
    message: 'ローカルJSONを書き出しました。Google Drive API連携は backupService に追加予定です。'
  });
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
