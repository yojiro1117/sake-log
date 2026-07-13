import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Section } from '../components/Section';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { analyzeLogs } from '../services/analysis';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function Analysis() {
  const logs = useLiveQuery(() => db.logs.toArray(), []);
  const analysis = analyzeLogs(logs.filter((log) => (log.status ?? 'complete') === 'complete'));

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold text-gold">味覚傾向分析</p>
        <h1 className="mt-1 text-2xl font-black">好みとコスパの傾向を見る</h1>
      </header>

      <Section title="酒種類別平均評価">
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

      <Section title="サマリー">
        <div className="grid grid-cols-2 gap-3">
          <Metric label="好きな酒種類" value={analysis.favoriteType?.label ?? '記録待ち'} />
          <Metric label="平均評価" value={analysis.averageRating ? `${analysis.averageRating}/6` : '記録待ち'} />
          <Metric label="平均価格" value={analysis.averagePrice ? `${analysis.averagePrice.toLocaleString()}円` : '価格未入力'} />
          <Metric label="記録数" value={`${logs.length}件`} />
        </div>
      </Section>

      <Section title="味覚傾向">
        <div className="grid grid-cols-2 gap-3">
          {analysis.favoriteFeatures.map((feature) => (
            <div key={feature.label} className="glass-panel rounded-lg p-4">
              <p className="font-bold text-gold">{feature.label}</p>
              <p className="text-sm text-rice/66">平均 {feature.average}</p>
            </div>
          ))}
          {analysis.favoriteFeatures.length === 0 ? <p className="text-rice/56">記録を保存すると傾向が表示されます。</p> : null}
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

      <Section title="好きな蔵元">
        <div className="space-y-2">
          {analysis.favoriteMakers.map((maker) => (
            <div key={maker.name} className="flex justify-between rounded-md bg-rice/8 px-4 py-3">
              <span>{maker.name}</span>
              <span className="text-gold">平均 {maker.average} / {maker.count}件</span>
            </div>
          ))}
          {analysis.favoriteMakers.length === 0 ? <p className="text-rice/56">蔵元を入力すると表示されます。</p> : null}
        </div>
      </Section>

      <Section title="価格帯分布">
        <div className="grid grid-cols-2 gap-3">
          {analysis.priceBands.map((band) => <Metric key={band.label} label={band.label} value={`${band.count}件`} />)}
        </div>
      </Section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-rice/8 p-4">
      <p className="text-xs text-rice/52">{label}</p>
      <p className="mt-1 font-bold text-gold">{value}</p>
    </div>
  );
}
