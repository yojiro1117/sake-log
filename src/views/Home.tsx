import { Cloud, ImagePlus, Plus } from 'lucide-react';
import { Section } from '../components/Section';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { analyzeLogs } from '../services/analysis';
import { highScoreRanking, valueRanking } from '../services/scoring';
import { alcoholProfiles } from '../data/alcoholProfiles';
import { deleteDraft, draftProgress, isValidDraft } from '../services/draftService';
import type { Tab } from '../components/BottomNav';
import type { SakeLog } from '../types';

export function Home({
  onNavigate,
  onImportPhotos,
  onResumeDraft
}: {
  onNavigate: (tab: Tab) => void;
  onImportPhotos: (files: File[]) => void;
  onResumeDraft: (id: string) => void;
}) {
  const logs = useLiveQuery(() => db.logs.orderBy('drankAt').reverse().toArray(), []);
  const backup = useLiveQuery(() => db.backupStatus.get('default'), undefined);
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), []);
  const rawDrafts: unknown[] = drafts;
  const validDrafts = rawDrafts.filter(isValidDraft);
  const corruptDraftIds = rawDrafts
    .filter((draft) => !isValidDraft(draft))
    .map((draft) => String((draft as { id?: unknown }).id ?? ''))
    .filter(Boolean);
  const incompleteCount = logs.filter((log) => log.status && log.status !== 'complete').length;
  const completeLogs = logs.filter((log) => (log.status ?? 'complete') === 'complete');
  const analysis = analyzeLogs(completeLogs);
  const recent = logs[0];
  const highScores = highScoreRanking(completeLogs.filter((log) => Number.isFinite(log.satisfactionScore)), 3);
  const values = valueRanking(completeLogs.filter((log) => log.valueScore && log.adoptedMarketPrice), 3);

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-rice p-5 text-ink shadow-glow">
        <p className="text-sm font-bold text-moss">SAKEログ</p>
        <h1 className="mt-2 text-3xl font-black">今日の一杯を、手軽に記録。</h1>
        <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-4 font-bold text-rice" onClick={() => onNavigate('record')}>
          <Plus size={20} />
          今日のお酒を記録する
        </button>
        <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/20 bg-moss px-4 py-4 font-bold text-rice">
          <ImagePlus size={20} />
          写真から記録する
          <input
            className="hidden"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) onImportPhotos(files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>

      {validDrafts.length ? (
        <Section title="入力途中の記録">
          <div className="space-y-2">
            {validDrafts.map((draft) => (
              <div key={draft.id} className="rounded-lg bg-rice/8 p-4">
                <p className="font-bold">{String(draft.formState.productName || '銘柄未入力')}</p>
                <p className="mt-1 text-xs text-rice/55">
                  進捗 {draftProgress(draft.formState)}% / 写真 {draft.photos.length}枚 / {new Date(draft.updatedAt).toLocaleString('ja-JP')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="rounded-md bg-gold px-3 py-2 font-bold text-ink" onClick={() => onResumeDraft(draft.id)}>続きから再開</button>
                  <button className="rounded-md bg-rice/10 px-3 py-2" onClick={() => void deleteDraft(draft.id)}>破棄</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {corruptDraftIds.length ? (
        <div className="rounded-lg border border-red-300/25 bg-red-950/30 p-4 text-sm">
          <p className="font-bold text-red-200">復元できないドラフトが{corruptDraftIds.length}件あります。</p>
          <p className="mt-1 text-rice/60">アプリ本体は継続して利用できます。診断情報を確認するか、破損ドラフトを破棄してください。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="rounded-md bg-rice/10 px-3 py-2" onClick={() => onNavigate('settings')}>診断情報を表示</button>
            <button className="rounded-md bg-red-900/50 px-3 py-2" onClick={() => void db.drafts.bulkDelete(corruptDraftIds)}>破棄</button>
          </div>
        </div>
      ) : null}

      {incompleteCount ? (
        <button className="w-full rounded-lg border border-gold/30 bg-gold/10 p-4 text-left font-bold text-gold" onClick={() => onNavigate('logs')}>
          あとで編集する記録が{incompleteCount}件あります
        </button>
      ) : null}

      <Section title="最近記録したお酒">
        {recent ? (
          <div className="glass-panel rounded-lg p-4">
            <p className="text-xl font-bold">{recent.productName}</p>
            <p className="mt-1 text-sm text-rice/66">
              {alcoholProfiles[recent.alcoholType].label} / 満足度 {recent.satisfactionScore}/6 / コスパ {recent.valueScore}
            </p>
          </div>
        ) : (
          <Empty text="まだ記録がありません。写真や評価を残すと、ここに最近の記録が表示されます。" />
        )}
      </Section>

      <Section title="味覚傾向サマリー">
        <div className="grid grid-cols-2 gap-3">
          {analysis.favoriteFeatures.slice(0, 2).map((feature) => (
            <div key={feature.label} className="glass-panel rounded-lg p-4">
              <p className="text-xs text-rice/55">好きな傾向</p>
              <p className="mt-1 font-bold text-gold">{feature.label}</p>
              <p className="text-sm text-rice/70">平均 {feature.average}</p>
            </div>
          ))}
          {analysis.favoriteFeatures.length === 0 && <Empty text="記録が増えると味覚傾向が表示されます。" />}
        </div>
      </Section>

      <Section title="高評価ランキング">
        <RankingList
          logs={highScores}
          empty="保存後にランキングが表示されます。"
          render={(log) => `${log.satisfactionScore}/6 / 補正後 ${log.correctedScore}`}
        />
      </Section>

      <Section title="コスパランキング">
        <RankingList
          logs={values}
          empty="保存後にランキングが表示されます。"
          render={(log) => `${log.valueScore ?? 'D'} / ${log.adoptedMarketPrice ? `${log.adoptedMarketPrice.toLocaleString()}円` : '価格未取得'}`}
        />
      </Section>

      <Section title="バックアップ状態">
        <div className="flex items-start gap-3 rounded-lg border border-gold/20 bg-moss/50 p-4">
          <Cloud className="mt-1 text-gold" size={20} />
          <p className="text-sm leading-6 text-rice/78">{backup?.message ?? 'ローカル保存を準備中です。'}</p>
        </div>
      </Section>
    </div>
  );
}

function RankingList({ logs, empty, render }: { logs: SakeLog[]; empty: string; render: (log: SakeLog) => string }) {
  if (logs.length === 0) return <Empty text={empty} />;
  return (
    <div className="space-y-2">
      {logs.map((log, index) => (
        <div key={log.logId} className="flex items-center justify-between rounded-md bg-rice/8 px-4 py-3">
          <span className="font-semibold">{index + 1}. {log.productName}</span>
          <span className="text-sm text-gold">{render(log)}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-rice/16 p-4 text-sm text-rice/56">{text}</p>;
}
