import { Activity, Download, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Field, Section } from '../components/Section';
import { BUILD_INFO } from '../config/buildInfo';
import { FEATURES } from '../config/features';
import { defaultToneSettings } from '../data/templates';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { downloadBlob, exportLocalData, inspectBackup, restoreLocalData } from '../services/backupService';
import { checkServiceWorkerUpdate, clearApplicationCaches, createSafeDiagnostics, type SafeDiagnostics } from '../services/diagnosticsService';
import type { OcrCorrectionEntry, PostTemplate, ToneSettings } from '../types';
import { testRakutenApplicationId } from '../services/priceService';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Settings() {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const corrections = useLiveQuery(() => db.ocrCorrections.orderBy('lastUsedAt').reverse().toArray(), []);
  const [status, setStatus] = useState('');
  const [rakutenId, setRakutenId] = useState('');
  const [rakutenLoaded, setRakutenLoaded] = useState(false);
  const [editingCorrection, setEditingCorrection] = useState<{ id: string; value: string }>();
  const [deviceResults, setDeviceResults] = useState<Record<string, 'success' | 'failed' | 'untested'>>({});
  const tone = settings?.toneSettings ?? defaultToneSettings;
  const [diagnostics, setDiagnostics] = useState<SafeDiagnostics | undefined>();

  useEffect(() => {
    if (!settings || rakutenLoaded) return;
    setRakutenId(settings.rakutenApplicationId ?? '');
    setRakutenLoaded(true);
  }, [rakutenLoaded, settings]);

  useEffect(() => {
    void db.deviceValidationResults.get('default').then((result) => setDeviceResults(result?.results ?? {}));
  }, []);

  async function saveRakutenId() {
    if (rakutenId && !/^[A-Za-z0-9_-]{6,64}$/.test(rakutenId)) { setStatus('Application IDの形式を確認してください。'); return; }
    try {
      await db.userSettings.update('default', { rakutenApplicationId: rakutenId || undefined });
      setStatus(rakutenId ? '楽天アプリIDを端末内に保存しました。' : '楽天アプリIDを削除しました。');
    } catch { setStatus('楽天アプリIDを保存できませんでした。'); }
  }

  async function updateTone(next: Partial<ToneSettings>) {
    await db.userSettings.update('default', { toneSettings: { ...tone, ...next } });
  }

  async function exportData() {
    const blob = await exportLocalData();
    downloadBlob(blob, `sake-log-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    setStatus('写真を含む完全バックアップZIPを書き出しました。');
  }

  async function restoreData(file?: File) {
    if (!file) return;
    try {
      const { manifest } = await inspectBackup(file);
      const mode = window.confirm(`バックアップを確認しました。ログ${manifest.counts.logs ?? 0}件、画像${manifest.counts.images ?? 0}件です。現在データを置き換えますか？\nキャンセルを選ぶと結合します。`) ? 'replace' : 'merge';
      if (mode === 'replace') {
        const safetyBackup = await exportLocalData();
        downloadBlob(safetyBackup, `sake-log-before-restore-${new Date().toISOString().slice(0, 10)}.zip`);
      }
      await restoreLocalData(file, mode);
      setStatus(`バックアップを${mode === 'replace' ? '置き換え' : '結合'}復元しました。`);
    } catch (error) { setStatus(error instanceof Error ? `復元を中止しました。${error.message}` : '復元を中止しました。'); }
  }

  async function updateTemplate(template: PostTemplate, body: string) {
    await db.templates.put({ ...template, body, updatedAt: new Date().toISOString() });
  }

  async function exportCorrections() {
    downloadBlob(new Blob([JSON.stringify(corrections, null, 2)], { type: 'application/json' }), 'sake-log-ocr-corrections.json');
  }

  async function importCorrections(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('ファイルサイズは1MB以下にしてください。');
      const parsed = JSON.parse(await file.text()) as OcrCorrectionEntry[];
      if (!Array.isArray(parsed)) throw new Error('配列形式ではありません。');
      const valid = parsed.filter((entry) => typeof entry.id === 'string' && typeof entry.observedText === 'string' && typeof entry.correctedProductName === 'string');
      if (!window.confirm(`${valid.length}件を既存辞書へID単位で結合します。続行しますか？`)) return;
      await db.ocrCorrections.bulkPut(valid);
      setStatus(`${valid.length}件のOCR修正辞書を読み込みました。`);
    } catch {
      setStatus('OCR修正辞書を読み込めませんでした。JSON形式を確認してください。');
    }
  }

  async function updateDeviceResult(key: string, value: 'success' | 'failed' | 'untested') {
    const next = { ...deviceResults, [key]: value };
    setDeviceResults(next);
    await db.deviceValidationResults.put({ id: 'default', updatedAt: new Date().toISOString(), results: next, notes: {} });
  }

  async function refreshDiagnostics() {
    setDiagnostics(await createSafeDiagnostics());
  }

  async function copyDiagnostics() {
    const value = diagnostics ?? await createSafeDiagnostics();
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setStatus('機密情報を除外した診断情報をコピーしました。');
  }

  async function exportDiagnostics() {
    const value = diagnostics ?? await createSafeDiagnostics();
    downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), 'sake-log-diagnostics.json');
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold text-gold">設定</p>
        <h1 className="mt-1 text-2xl font-black">記録とバックアップの設定</h1>
      </header>

      <Section title="20歳以上確認">
        <div className="rounded-lg bg-rice/8 p-4">
          <p className="font-bold">{settings?.ageConfirmed ? '確認済み' : '未確認'}</p>
          <p className="mt-2 text-sm text-rice/62">お酒は20歳になってから。過度な飲酒や飲酒運転を助長する文言は生成・表示しません。</p>
        </div>
      </Section>

      <Section title="楽天アプリID">
        <div className="grid gap-3">
          <Field label="Application ID">
            <input className={inputClass} type="password" autoComplete="off" value={rakutenId} onChange={(event) => setRakutenId(event.target.value)} />
          </Field>
          <button className="flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 font-bold text-ink" onClick={saveRakutenId}>
            <Save size={18} />
            保存
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-md bg-rice/10 px-3 py-3" onClick={() => void testRakutenApplicationId(rakutenId).then((result) => setStatus(result.message))}>接続テスト</button>
            <button className="rounded-md border border-red-300/20 px-3 py-3 text-red-200" onClick={() => { setRakutenId(''); void db.userSettings.update('default', { rakutenApplicationId: undefined }).then(() => setStatus('楽天アプリIDを削除しました。')); }}>削除</button>
          </div>
          <p className="text-xs leading-5 text-rice/54">APIキー秘匿用サーバーは使わず、本人の端末内だけに保存します。未設定でも手入力価格で記録できます。</p>
        </div>
      </Section>

      {FEATURES.postTextGeneration ? (
        <Section title="コメント文設定">
          <div className="grid grid-cols-2 gap-3">
            <Select label="口調" value={tone.voice} onChange={(value) => updateTone({ voice: value as ToneSettings['voice'] })} options={[['polite', '丁寧'], ['natural', '自然体'], ['casual', 'フランク'], ['expert', '専門家風']]} />
            <Select label="文章量" value={tone.length} onChange={(value) => updateTone({ length: value as ToneSettings['length'] })} options={[['short', '短め'], ['standard', '標準'], ['detailed', '詳しめ']]} />
            <Select label="テンション" value={tone.energy} onChange={(value) => updateTone({ energy: value as ToneSettings['energy'] })} options={[['calm', '落ち着き'], ['standard', '標準'], ['bright', '明るめ']]} />
          </div>
        </Section>
      ) : null}

      {FEATURES.commentTemplates ? (
        <Section title="コメントテンプレート管理">
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.templateId} className="rounded-lg bg-rice/8 p-4">
                <p className="mb-2 font-bold text-gold">{template.templateName}</p>
                <textarea className={`${inputClass} min-h-28`} value={template.body} onChange={(event) => updateTemplate(template, event.target.value)} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="OCR修正辞書">
        <div className="space-y-3">
          {corrections.map((entry) => (
            <div key={entry.id} className="rounded-lg bg-rice/8 p-4">
              <p className="text-sm text-rice/60">誤認識: {entry.observedText.slice(0, 60)}</p>
              {editingCorrection?.id === entry.id ? <div className="mt-2 grid gap-2"><input className={inputClass} value={editingCorrection.value} onChange={(event) => setEditingCorrection({ id: entry.id, value: event.target.value })} /><div className="grid grid-cols-2 gap-2"><button className="rounded bg-gold px-2 py-2 text-ink" onClick={() => void db.ocrCorrections.update(entry.id, { correctedProductName: editingCorrection.value.trim() }).then(() => setEditingCorrection(undefined))}>保存</button><button className="rounded bg-rice/10 px-2 py-2" onClick={() => setEditingCorrection(undefined)}>キャンセル</button></div></div> : <button className="mt-2 rounded bg-rice/10 px-3 py-2" onClick={() => setEditingCorrection({ id: entry.id, value: entry.correctedProductName })}>編集</button>}
              <div className="mt-2 flex items-center justify-between text-xs text-rice/55">
                <span>使用 {entry.occurrenceCount}回 / {new Date(entry.lastUsedAt).toLocaleDateString('ja-JP')}</span>
                <button className="rounded p-2 text-red-200" title="削除" onClick={() => window.confirm('この辞書項目を削除しますか？') && void db.ocrCorrections.delete(entry.id)}><Trash2 size={17} /></button>
              </div>
            </div>
          ))}
          {corrections.length === 0 ? <p className="text-sm text-rice/55">修正履歴はまだありません。</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-2 rounded-md bg-rice/10 px-3 py-3" onClick={exportCorrections}><Download size={17} />書き出し</button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-rice/10 px-3 py-3">
              <Upload size={17} />読み込み
              <input className="hidden" type="file" accept="application/json" onChange={(event) => void importCorrections(event.target.files?.[0])} />
            </label>
          </div>
          <button className="w-full rounded-md border border-red-300/20 px-3 py-3 text-red-200" onClick={() => window.confirm('OCR修正辞書をすべて削除しますか？') && void db.ocrCorrections.clear()}>辞書を全削除</button>
        </div>
      </Section>

      <Section title="アプリ診断">
        <div className="space-y-3 rounded-lg bg-rice/8 p-4 text-sm">
          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-gold px-3 py-3 font-bold text-ink" onClick={refreshDiagnostics}>
            <Activity size={18} />診断情報を更新
          </button>
          {diagnostics ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-ink/70 p-3 text-xs text-rice/70">{JSON.stringify(diagnostics, null, 2)}</pre> : null}
          <div className="grid gap-2">
            <button className="rounded-md bg-rice/10 px-3 py-3" onClick={copyDiagnostics}>診断情報をコピー</button>
            <button className="rounded-md bg-rice/10 px-3 py-3" onClick={exportDiagnostics}>診断JSONを書き出し</button>
            <button className="rounded-md bg-rice/10 px-3 py-3" onClick={() => window.confirm('PWAのファイルキャッシュを削除します。IndexedDBの酒ログや写真は削除しません。オフライン利用には再読込が必要です。続行しますか？') && void clearApplicationCaches().then((count) => setStatus(`${count}件のキャッシュを削除しました。オンラインで再読込してください。`))}>キャッシュを削除</button>
            <button className="flex items-center justify-center gap-2 rounded-md bg-rice/10 px-3 py-3" onClick={() => void checkServiceWorkerUpdate().then((waiting) => setStatus(waiting ? '新しいバージョンがあります。再読込してください。' : '現在のバージョンは最新です。'))}>
              <RefreshCw size={17} />更新を確認
            </button>
          </div>
          <p className="text-xs leading-5 text-rice/50">診断情報にはAPIキー、画像、コメント本文、酒ログ本文を含めません。外部送信もしません。</p>
        </div>
      </Section>

      <Section title="実機検証モード">
        <div className="grid gap-2 rounded-lg bg-rice/8 p-4">
          {['写真ライブラリ','HEIC','10枚選択','OCRモデル初回取得','OCR再利用','オフラインOCR','PWAインストール','PWA再起動','強制終了後ドラフト復元','キーボード','Safe Area','カメラ','メモリ不足','Service Worker更新','バックアップ','復元'].map((item) => <label key={item} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm"><span>{item}</span><select className="rounded bg-ink px-2 py-2" value={deviceResults[item] ?? 'untested'} onChange={(event) => void updateDeviceResult(item, event.target.value as 'success' | 'failed' | 'untested')}><option value="untested">未実施</option><option value="success">成功</option><option value="failed">失敗</option></select></label>)}
          <button className="mt-2 rounded-md bg-rice/10 px-3 py-3" onClick={() => downloadBlob(new Blob([JSON.stringify({ version: BUILD_INFO.version, build: BUILD_INFO.commit, updatedAt: new Date().toISOString(), results: deviceResults }, null, 2)], { type: 'application/json' }), 'sake-log-device-validation.json')}>結果JSONを書き出し</button>
        </div>
      </Section>

      <Section title="バックアップ">
        <div className="grid gap-3">
          <button className="flex items-center justify-center gap-2 rounded-md bg-rice px-4 py-3 font-bold text-ink" onClick={exportData}>
            <Download size={18} />
            完全バックアップZIPを作成
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-rice/10 px-4 py-3"><Upload size={18} />バックアップを復元<input className="hidden" type="file" accept="application/zip,.zip" onChange={(event) => void restoreData(event.target.files?.[0])} /></label>
          <p className="text-sm leading-6 text-rice/62">ログ、写真、価格候補、ドラフト、設定、修正辞書をZIPへ保存します。復元前にmanifestとチェックサムを検証します。</p>
        </div>
      </Section>

      <Section title="アプリ情報">
        <div className="rounded-lg bg-rice/8 p-4 text-sm leading-7 text-rice/70">
          <p><span className="font-bold text-rice">Version</span> {BUILD_INFO.version}</p>
          <p><span className="font-bold text-rice">Build</span> {BUILD_INFO.commit}</p>
          <p><span className="font-bold text-rice">Build time</span> {BUILD_INFO.buildTime}</p>
        </div>
      </Section>

      {status ? <p className="rounded-md bg-gold/15 p-3 text-sm text-gold">{status}</p> : null}
    </div>
  );
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </Field>
  );
}
