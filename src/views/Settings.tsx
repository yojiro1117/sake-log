import { Activity, Download, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Field, Section } from '../components/Section';
import { BUILD_INFO } from '../config/buildInfo';
import { FEATURES } from '../config/features';
import { defaultToneSettings } from '../data/templates';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { downloadBlob, exportLocalData } from '../services/backupService';
import { checkServiceWorkerUpdate, clearApplicationCaches, createSafeDiagnostics, type SafeDiagnostics } from '../services/diagnosticsService';
import type { OcrCorrectionEntry, PostTemplate, ToneSettings } from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Settings() {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const corrections = useLiveQuery(() => db.ocrCorrections.orderBy('lastUsedAt').reverse().toArray(), []);
  const [status, setStatus] = useState('');
  const [rakutenId, setRakutenId] = useState('');
  const tone = settings?.toneSettings ?? defaultToneSettings;
  const [diagnostics, setDiagnostics] = useState<SafeDiagnostics | undefined>();

  async function saveRakutenId() {
    await db.userSettings.update('default', { rakutenApplicationId: rakutenId || settings?.rakutenApplicationId });
    setStatus('楽天アプリIDを端末内に保存しました。');
  }

  async function updateTone(next: Partial<ToneSettings>) {
    await db.userSettings.update('default', { toneSettings: { ...tone, ...next } });
  }

  async function exportData() {
    const blob = await exportLocalData();
    downloadBlob(blob, `sake-log-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setStatus('ローカルバックアップJSONを書き出しました。');
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
      const parsed = JSON.parse(await file.text()) as OcrCorrectionEntry[];
      const valid = parsed.filter((entry) => entry.id && entry.observedText && entry.correctedProductName);
      await db.ocrCorrections.bulkPut(valid);
      setStatus(`${valid.length}件のOCR修正辞書を読み込みました。`);
    } catch {
      setStatus('OCR修正辞書を読み込めませんでした。JSON形式を確認してください。');
    }
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
            <input className={inputClass} value={rakutenId || settings?.rakutenApplicationId || ''} onChange={(event) => setRakutenId(event.target.value)} />
          </Field>
          <button className="flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 font-bold text-ink" onClick={saveRakutenId}>
            <Save size={18} />
            保存
          </button>
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

      <Section title="診断">
        <div className="grid gap-3">
          <Diagnosis title="性格診断" description="感想の書き方や記録スタイルの傾向を、後続実装で端末内に保存できるようにします。" />
          <Diagnosis title="飲酒レビュー用プロフィール診断" description="香味探求、食中酒、コスパ実用などのタイプ判定を後続実装で追加予定です。" />
        </div>
      </Section>

      <Section title="OCR修正辞書">
        <div className="space-y-3">
          {corrections.map((entry) => (
            <div key={entry.id} className="rounded-lg bg-rice/8 p-4">
              <p className="text-sm text-rice/60">誤認識: {entry.observedText.slice(0, 60)}</p>
              <input
                className={`${inputClass} mt-2`}
                value={entry.correctedProductName}
                onChange={(event) => void db.ocrCorrections.update(entry.id, { correctedProductName: event.target.value })}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-rice/55">
                <span>使用 {entry.occurrenceCount}回 / {new Date(entry.lastUsedAt).toLocaleDateString('ja-JP')}</span>
                <button className="rounded p-2 text-red-200" title="削除" onClick={() => void db.ocrCorrections.delete(entry.id)}><Trash2 size={17} /></button>
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
          <button className="w-full rounded-md border border-red-300/20 px-3 py-3 text-red-200" onClick={() => void db.ocrCorrections.clear()}>辞書を全削除</button>
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
            <button className="rounded-md bg-rice/10 px-3 py-3" onClick={() => void clearApplicationCaches().then((count) => setStatus(`${count}件のキャッシュを削除しました。`))}>キャッシュを削除</button>
            <button className="flex items-center justify-center gap-2 rounded-md bg-rice/10 px-3 py-3" onClick={() => void checkServiceWorkerUpdate().then((waiting) => setStatus(waiting ? '新しいバージョンがあります。再読込してください。' : '現在のバージョンは最新です。'))}>
              <RefreshCw size={17} />更新を確認
            </button>
          </div>
          <p className="text-xs leading-5 text-rice/50">診断情報にはAPIキー、画像、コメント本文、酒ログ本文を含めません。外部送信もしません。</p>
        </div>
      </Section>

      <Section title="バックアップ">
        <div className="grid gap-3">
          <button className="flex items-center justify-center gap-2 rounded-md bg-rice px-4 py-3 font-bold text-ink" onClick={exportData}>
            <Download size={18} />
            データエクスポート
          </button>
          <p className="text-sm leading-6 text-rice/62">Google Drive連携は後続実装です。現在は端末内データのローカル書き出しに対応しています。</p>
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

function Diagnosis({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg bg-rice/8 p-4">
      <p className="font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-rice/60">{description}</p>
    </div>
  );
}
