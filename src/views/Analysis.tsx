import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip
} from 'chart.js';
import { Section } from '../components/Section';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { analyzeLogs } from '../services/analysis';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function Analysis() {
  const logs = useLiveQuery(() => db.logs.toArray(), []);
  const analysis = analyzeLogs(logs);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold text-gold">味覚傾向分析</p>
        <h1 className="mt-1 text-2xl font-black">好みとコスパの輪郭を見る</h1>
      </header>

      <Section title="酒種別平均評価">
        <div className="h-72 rounded-lg bg-rice p-4 text-ink">
          <Bar
            data={{
              labels: analysis.byType.map((item) => item.label),
              datasets: [{ data: analysis.byType.map((item) => item.average), backgroundColor: ['#d9b45f', '#173f35', '#101a33', '#8fb8a8'] }]
            }}
            options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 6 } } }}
          />
        </div>
      </Section>

      <Section title="好きな傾向">
        <div className="grid grid-cols-2 gap-3">
          {analysis.favoriteFeatures.map((feature) => (
            <div key={feature.label} className="glass-panel rounded-lg p-4">
              <p className="font-bold text-gold">{feature.label}</p>
              <p className="text-sm text-rice/66">平均 {feature.average}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="苦手な傾向">
        <div className="grid grid-cols-2 gap-3">
          {analysis.weakFeatures.map((feature) => (
            <div key={feature.label} className="rounded-lg bg-rice/8 p-4">
              <p className="font-bold">{feature.label}</p>
              <p className="text-sm text-rice/56">平均 {feature.average}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="リピート・コスパ傾向">
        <div className="space-y-2">
          {[...analysis.bestValues, ...analysis.repeatables].slice(0, 6).map((log) => (
            <div key={log.logId} className="flex justify-between rounded-md bg-rice/8 px-4 py-3">
              <span>{log.productName}</span>
              <span className="text-gold">満足度 {log.satisfactionScore} / {log.valueScore}</span>
            </div>
          ))}
          {logs.length === 0 ? <p className="text-rice/56">ログを保存すると分析が表示されます。</p> : null}
        </div>
      </Section>
    </div>
  );
}
