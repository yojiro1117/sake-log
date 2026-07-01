import { ShieldCheck } from 'lucide-react';
import { db } from '../db/db';

export function AgeGate() {
  return (
    <main className="min-h-screen bg-ink px-5 py-10 text-rice">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center">
        <div className="glass-panel rounded-lg p-6 shadow-glow">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink">
            <ShieldCheck size={30} />
          </div>
          <p className="text-sm font-semibold text-gold">SAKEログ</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">20歳以上確認</h1>
          <p className="mt-4 text-sm leading-7 text-rice/78">
            このアプリは酒類の記録を扱います。20歳未満の飲酒を助長する表現、飲酒運転、過度な飲酒を促す表現は生成しません。
          </p>
          <button
            className="mt-7 w-full rounded-md bg-gold px-5 py-4 font-bold text-ink"
            onClick={() => db.userSettings.update('default', { ageConfirmed: true })}
          >
            20歳以上です
          </button>
          <p className="mt-4 text-center text-xs text-rice/55">お酒は20歳になってから。飲酒運転はやめましょう。</p>
        </div>
      </div>
    </main>
  );
}
