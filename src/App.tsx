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
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>();
  const [selectedLogId, setSelectedLogId] = useState<string | undefined>();
  const [recordMode, setRecordMode] = useState<'new' | 'resume'>('new');
  const [recordSessionKey, setRecordSessionKey] = useState(() => crypto.randomUUID());
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);

  useEffect(() => {
    ensureSeedData().catch(console.error);
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = (event.state?.tab as Tab | undefined) ?? 'home';
      setActiveTab(next);
      setSelectedLogId(event.state?.selectedLogId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(tab: Tab, logId?: string) {
    setActiveTab(tab);
    setSelectedLogId(logId);
    window.history.pushState({ tab, selectedLogId: logId }, '', window.location.href);
  }

  function startNewRecord() {
    setImportFiles([]);
    setResumeDraftId(undefined);
    setSelectedLogId(undefined);
    setRecordMode('new');
    setRecordSessionKey(crypto.randomUUID());
    navigate('record');
  }

  if (!settings?.ageConfirmed) return <AgeGate />;

  return (
    <div className="min-h-screen bg-ink text-rice">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(217,180,95,0.18),transparent_30%),linear-gradient(135deg,#07100d,#11161f_45%,#101a33)]" />
      <main className="mx-auto max-w-xl px-4 pb-28 pt-5">
        {activeTab === 'home' && (
          <Home
            onNavigate={(tab) => tab === 'record' ? startNewRecord() : navigate(tab)}
            onResumeDraft={(id) => {
              setResumeDraftId(id);
              setImportFiles([]);
              setRecordMode('resume');
              setRecordSessionKey(crypto.randomUUID());
              navigate('record');
            }}
            onImportPhotos={(files) => {
              setImportFiles(files);
              setResumeDraftId(undefined);
              setRecordMode('new');
              setRecordSessionKey(crypto.randomUUID());
              navigate('record');
            }}
          />
        )}
        {activeTab === 'record' && <Record key={recordSessionKey} importFiles={importFiles} resumeDraftId={recordMode === 'resume' ? resumeDraftId : undefined} onImportQueueDone={() => { setImportFiles([]); setResumeDraftId(undefined); }} onOpenLogDetail={(id) => navigate('logs', id)} onStartNewRecord={startNewRecord} onGoHome={() => { setImportFiles([]); setResumeDraftId(undefined); navigate('home'); }} />}
        {activeTab === 'logs' && <Logs selectedLogId={selectedLogId} onCloseSelected={() => setSelectedLogId(undefined)} />}
        {activeTab === 'analysis' && <Analysis />}
        {activeTab === 'settings' && <Settings />}
      </main>
      <BottomNav active={activeTab} onChange={(tab) => tab === 'record' ? startNewRecord() : navigate(tab)} />
    </div>
  );
}
