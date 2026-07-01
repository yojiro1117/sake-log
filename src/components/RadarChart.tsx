import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import type { AlcoholType } from '../types';
import { alcoholProfiles } from '../data/alcoholProfiles';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export function RadarChart({ type, scores, label = '特徴スコア' }: { type: AlcoholType; scores: Record<string, number>; label?: string }) {
  const profile = alcoholProfiles[type];
  return (
    <Radar
      data={{
        labels: profile.axes.map((axis) => axis.label),
        datasets: [
          {
            label,
            data: profile.axes.map((axis) => scores[axis.key] ?? 3),
            borderColor: '#d9b45f',
            backgroundColor: 'rgba(217,180,95,0.28)',
            pointBackgroundColor: '#f7f3e8',
            pointBorderColor: '#d9b45f',
            borderWidth: 2
          }
        ]
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          r: {
            min: 0,
            max: 6,
            ticks: { stepSize: 1, color: 'rgba(247,243,232,0.55)', backdropColor: 'transparent' },
            angleLines: { color: 'rgba(247,243,232,0.16)' },
            grid: { color: 'rgba(247,243,232,0.16)' },
            pointLabels: { color: '#f7f3e8', font: { size: 12, weight: 600 } }
          }
        }
      }}
    />
  );
}
