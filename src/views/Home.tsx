import { Cloud, Plus } from 'lucide-react';
import { Section } from '../components/Section';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { analyzeLogs } from '../services/analysis';
import { alcoholProfiles } from '../data/alcoholProfiles';
import type { Tab } from '../components/BottomNav';

export function Home({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const logs = useLiveQuery(() => db.logs.orderBy('drankAt').reverse().toArray(), []);
  const backup = useLiveQuery(() => db.backupStatus.get('default'), undefined);
  const analysis = analyzeLogs(logs);
  const recent = logs[0];

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-rice p-5 text-ink shadow-glow">
        <p className="text-sm font-bold text-moss">SAKEログ</p>
        <h1 className="mt-2 text-3xl font-black">今日の一杯を、記録から投稿まで。</h1>
        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-4 font-bold text-rice"
          onClick={() => onNavigate('record')}
        >
          <Plus size={20} />
          今日のお酒を記録する
        </button>
      </div>

      <Section title="最近記録したお酒">
        {recent ? (
          <div className="glass-panel rounded-lg p-4">
            <p className="text-xl font-bold">{recent.productName}</p>
            <p className="mt-1 text-sm text-rice/66">
              {alcoholProfiles[recent.alcoholType].label} / 満足度 {recent.satisfactionScore}/6 / コスパ {recent.valueScore}
            </p>
          </div>
        ) : (
          <Empty text="まだ記録がありません。" />
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
          {analysis.favoriteFeatures.length === 0 && <Empty text="記録が増えると傾向が出ます。" />}
        </div>
      </Section>

      <Section title="高評価・コスパ上位">
        <div className="space-y-2">
          {logs
            .filter((log) => log.satisfactionScore >= 5 || log.valueScore === 'S')
            .slice(0, 3)
            .map((log) => (
              <div key={log.logId} className="flex items-center justify-between rounded-md bg-rice/8 px-4 py-3">
                <span className="font-semibold">{log.productName}</span>
                <span className="text-sm text-gold">{log.valueScore} / {log.satisfactionScore}</span>
              </div>
            ))}
          {logs.length === 0 && <Empty text="保存後にランキングが表示されます。" />}
        </div>
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

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-rice/16 p-4 text-sm text-rice/56">{text}</p>;
}
