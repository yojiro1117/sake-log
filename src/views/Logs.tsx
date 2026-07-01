import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RadarChart } from '../components/RadarChart';
import { Field, Section } from '../components/Section';
import { alcoholOptions, alcoholProfiles } from '../data/alcoholProfiles';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import type { AlcoholType, SakeLog } from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Logs() {
  const logs = useLiveQuery(() => db.logs.orderBy('drankAt').reverse().toArray(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AlcoholType | 'all'>('all');
  const [sort, setSort] = useState<'date' | 'score' | 'price' | 'value'>('date');
  const [selected, setSelected] = useState<SakeLog | undefined>();

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return logs
      .filter((log) => filter === 'all' || log.alcoholType === filter)
      .filter((log) => {
        if (!keyword) return true;
        return [log.productName, log.makerName, log.region, ...(log.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(keyword);
      })
      .sort((a, b) => {
        if (sort === 'score') return b.satisfactionScore - a.satisfactionScore;
        if (sort === 'price') return (b.adoptedMarketPrice ?? 0) - (a.adoptedMarketPrice ?? 0);
        if (sort === 'value') return valueRank(b.valueScore) - valueRank(a.valueScore);
        return new Date(b.drankAt).getTime() - new Date(a.drankAt).getTime();
      });
  }, [filter, logs, query, sort]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold text-gold">マイ酒ログ</p>
        <h1 className="mt-1 text-2xl font-black">過去の一杯を探す</h1>
      </header>

      <div className="glass-panel rounded-lg p-4">
        <Field label="銘柄・メーカー・産地・タグ検索">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 text-rice/40" size={18} />
            <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <select className={inputClass} value={filter} onChange={(event) => setFilter(event.target.value as AlcoholType | 'all')}>
            <option value="all">すべて</option>
            {alcoholOptions.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
          </select>
          <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="date">日付順</option>
            <option value="score">評価順</option>
            <option value="price">価格順</option>
            <option value="value">コスパ順</option>
          </select>
        </div>
      </div>

      <Section title={`${filtered.length}件`}>
        <div className="space-y-3">
          {filtered.map((log) => (
            <button key={log.logId} className="w-full rounded-lg bg-rice/8 p-4 text-left" onClick={() => setSelected(log)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{log.productName}</p>
                  <p className="mt-1 text-sm text-rice/60">{alcoholProfiles[log.alcoholType].label} / {log.makerName || 'メーカー未入力'}</p>
                  <p className="mt-2 text-xs text-rice/48">{log.tags.map((tag) => `#${tag}`).join(' ')}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-gold">{log.satisfactionScore}/6</p>
                  <p className="text-sm text-rice/70">コスパ {log.valueScore}</p>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? <p className="rounded-lg border border-dashed border-rice/16 p-5 text-rice/56">条件に合うログがありません。</p> : null}
        </div>
      </Section>

      {selected ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/90 p-5 backdrop-blur">
          <div className="mx-auto max-w-lg rounded-lg bg-lacquer p-5">
            <button className="mb-4 rounded-md bg-rice/10 px-3 py-2" onClick={() => setSelected(undefined)}>閉じる</button>
            <h2 className="text-2xl font-black">{selected.productName}</h2>
            <p className="mt-1 text-gold">{alcoholProfiles[selected.alcoholType].label} / 満足度 {selected.satisfactionScore}/6 / コスパ {selected.valueScore}</p>
            <div className="mt-4 h-72"><RadarChart type={selected.alcoholType} scores={selected.baseScores} /></div>
            <p className="mt-4 rounded-md bg-rice/8 p-4 text-sm leading-7">{selected.generatedTexts.sns}</p>
            <p className="mt-3 text-sm text-rice/64">{selected.correctionReason}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function valueRank(value?: string) {
  const ranks: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
  return ranks[value ?? 'B'] ?? 2;
}
