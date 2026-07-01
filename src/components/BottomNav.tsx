import { BarChart3, Home, List, PenLine, Settings } from 'lucide-react';

export type Tab = 'home' | 'record' | 'logs' | 'analysis' | 'settings';

const tabs = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'record', label: '記録', icon: PenLine },
  { id: 'logs', label: 'ログ', icon: List },
  { id: 'analysis', label: '分析', icon: BarChart3 },
  { id: 'settings', label: '設定', icon: Settings }
] as const;

export function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-rice/10 bg-ink/95 px-2 pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              className={`flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] ${
                selected ? 'bg-gold text-ink' : 'text-rice/68'
              }`}
              onClick={() => onChange(tab.id)}
              aria-label={tab.label}
              title={tab.label}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
