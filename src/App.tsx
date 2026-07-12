import { useEffect, useState } from 'react';
import { AgeGate } from './components/AgeGate';
import { BottomNav, type Tab } from './components/BottomNav';
import { db, ensureSeedData } from './db/db';
import { useLiveQuery } from './hooks/useLiveQuery';
import { Analysis } from './views/Analysis';
import { Home } from './views/Home';
import { Logs } from './views/Logs';
import { Record } from './views/Record';
import { Settings } from './views/Settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);

  useEffect(() => {
    ensureSeedData().catch(console.error);
  }, []);

  if (!settings?.ageConfirmed) return <AgeGate />;

  return (
    <div className="min-h-screen bg-ink text-rice">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(217,180,95,0.18),transparent_30%),linear-gradient(135deg,#07100d,#11161f_45%,#101a33)]" />
      <main className="mx-auto max-w-xl px-4 pb-28 pt-5">
        {tab === 'home' && (
          <Home
            onNavigate={setTab}
            onImportPhotos={(files) => {
              setImportFiles(files);
              setTab('record');
            }}
          />
        )}
        {tab === 'record' && <Record importFiles={importFiles} onImportQueueDone={() => setImportFiles([])} />}
        {tab === 'logs' && <Logs />}
        {tab === 'analysis' && <Analysis />}
        {tab === 'settings' && <Settings />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
