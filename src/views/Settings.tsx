import { Download, Save } from 'lucide-react';
import { useState } from 'react';
import { Field, Section } from '../components/Section';
import { BUILD_INFO } from '../config/buildInfo';
import { FEATURES } from '../config/features';
import { defaultToneSettings } from '../data/templates';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { downloadBlob, exportLocalData } from '../services/backupService';
import type { PostTemplate, ToneSettings } from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Settings() {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const [status, setStatus] = useState('');
  const [rakutenId, setRakutenId] = useState('');
  const tone = settings?.toneSettings ?? defaultToneSettings;

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
