import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RadarChart } from '../components/RadarChart';
import { Field, Section } from '../components/Section';
import { alcoholOptions, alcoholProfiles } from '../data/alcoholProfiles';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { deleteLogTransaction, updateLogTransaction } from '../services/logRepository';
import type { AlcoholType, LogStatus, SakeImage, SakeLog } from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Logs({ selectedLogId, onCloseSelected }: { selectedLogId?: string; onCloseSelected?: () => void }) {
  const logs = useLiveQuery(() => db.logs.orderBy('drankAt').reverse().toArray(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AlcoholType | 'all'>('all');
  const [sort, setSort] = useState<'date' | 'capturedAt' | 'score' | 'price' | 'type'>('date');
  const [statusFilter, setStatusFilter] = useState<LogStatus | 'all'>('all');
  const [selected, setSelected] = useState<SakeLog | undefined>();
  const [selectedImages, setSelectedImages] = useState<SakeImage[]>([]);
  const [imageUrls, setImageUrls] = useState<Array<{ id: string; url: string; label: string }>>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailStatus, setDetailStatus] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeDetail = useCallback(() => {
    setSelected(undefined);
    setSelectedImages([]);
    setIsEditing(false);
    setConfirmDelete(false);
    onCloseSelected?.();
  }, [onCloseSelected]);

  useEffect(() => {
    if (!selectedLogId) return;
    void db.logs.get(selectedLogId).then((log) => {
      if (log) setSelected(log);
    });
  }, [selectedLogId]);

  useEffect(() => {
    if (!selected) return;
    void db.images.where('logId').equals(selected.logId).sortBy('sortOrder').then(setSelectedImages);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button,input,select,textarea')].filter((element) => !element.hasAttribute('disabled'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [closeDetail, selected]);

  useEffect(() => {
    const urls = selectedImages.map((image) => ({ id: image.imageId, url: URL.createObjectURL(image.processedBlob ?? image.originalBlob), label: image.imageType }));
    setImageUrls(urls);
    return () => urls.forEach((item) => URL.revokeObjectURL(item.url));
  }, [selectedImages]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return logs
      .filter((log) => filter === 'all' || log.alcoholType === filter)
      .filter((log) => statusFilter === 'all' || (log.status ?? 'complete') === statusFilter)
      .filter((log) => {
        if (!keyword) return true;
        return [log.productName, log.makerName, log.region, ...(log.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(keyword);
      })
      .sort((a, b) => {
        if (sort === 'score') return b.satisfactionScore - a.satisfactionScore;
        if (sort === 'price') return (b.adoptedMarketPrice ?? 0) - (a.adoptedMarketPrice ?? 0);
        if (sort === 'type') return alcoholProfiles[a.alcoholType].label.localeCompare(alcoholProfiles[b.alcoholType].label, 'ja');
        if (sort === 'capturedAt') return dateTime(b.capturedAt ?? b.drankAt) - dateTime(a.capturedAt ?? a.drankAt);
        return dateTime(b.drankAt) - dateTime(a.drankAt);
      });
  }, [filter, logs, query, sort, statusFilter]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold text-gold">マイ酒ログ</p>
        <h1 className="mt-1 text-2xl font-black">過去の一杯を探す</h1>
      </header>

      <div className="glass-panel rounded-lg p-4">
        <Field label="銘柄・蔵元検索">
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
            <option value="date">記録日</option>
            <option value="capturedAt">撮影日</option>
            <option value="score">評価</option>
            <option value="price">価格</option>
            <option value="type">酒種類</option>
          </select>
        </div>
        <select className={`${inputClass} mt-3`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LogStatus | 'all')}>
          <option value="all">すべての入力状態</option>
          <option value="complete">完成</option>
          <option value="incomplete">入力途中</option>
          <option value="needs_review">要確認</option>
        </select>
      </div>

      <Section title={`${filtered.length}件`}>
        <div className="space-y-3">
          {filtered.map((log) => (
            <button key={log.logId} className="w-full rounded-lg bg-rice/8 p-4 text-left" onClick={() => setSelected(log)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{log.productName}</p>
                  {(log.status ?? 'complete') !== 'complete' ? (
                    <span className="mt-1 inline-block rounded bg-gold/15 px-2 py-1 text-xs font-bold text-gold">
                      {log.status === 'incomplete' ? '入力途中' : '要確認'}
                    </span>
                  ) : null}
                  <p className="mt-1 text-sm text-rice/60">{alcoholProfiles[log.alcoholType].label} / {log.makerName || '蔵元未入力'}</p>
                  <p className="mt-1 text-xs text-rice/45">記録日 {log.drankAt ?? '未設定'}{log.capturedAt ? ` / 撮影日 ${log.capturedAt}` : ''}</p>
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/90 p-5 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="log-detail-title">
          <div ref={dialogRef} className="mx-auto max-w-lg rounded-lg bg-lacquer p-5">
            <button className="mb-4 min-h-11 rounded-md bg-rice/10 px-3 py-2" onClick={closeDetail}>閉じる</button>
            <h2 id="log-detail-title" className="text-2xl font-black">{selected.productName}</h2>
            <p className="mt-1 text-gold">{alcoholProfiles[selected.alcoholType].label} / 満足度 {selected.satisfactionScore}/6 / コスパ {selected.valueScore}</p>
            <div className="mt-4 h-72"><RadarChart type={selected.alcoholType} scores={selected.baseScores} /></div>
            {imageUrls.length ? <div className="mt-4 grid grid-cols-2 gap-2">{imageUrls.map((image) => <figure key={image.id}><img className="aspect-square w-full rounded object-cover" src={image.url} alt="酒ログ写真" /><figcaption className="mt-1 text-xs text-rice/55">{image.label}</figcaption></figure>)}</div> : null}
            <p className="mt-4 rounded-md bg-rice/8 p-4 text-sm leading-7">{selected.memo || '感想メモは未入力です。'}</p>
            <p className="mt-3 text-sm text-rice/64">{selected.correctionReason}</p>
            {isEditing ? (
              <div className="mt-4 grid gap-3 rounded-md border border-gold/20 p-4">
                <Field label="銘柄">
                  <input className={inputClass} value={selected.productName === '銘柄未入力' ? '' : selected.productName} onChange={(event) => setSelected({ ...selected, productName: event.target.value })} />
                </Field>
                <Field label="蔵元・メーカー">
                  <input className={inputClass} value={selected.makerName ?? ''} onChange={(event) => setSelected({ ...selected, makerName: event.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="飲酒日"><input className={inputClass} type="date" value={selected.drankAt ?? ''} onChange={(event) => setSelected({ ...selected, drankAt: event.target.value || undefined })} /></Field>
                  <Field label="撮影日"><input className={inputClass} type="date" value={selected.capturedAt ?? ''} onChange={(event) => setSelected({ ...selected, capturedAt: event.target.value || undefined })} /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="容量ml"><input className={inputClass} type="number" value={selected.volume ?? ''} onChange={(event) => setSelected({ ...selected, volume: Number(event.target.value) || undefined })} /></Field>
                  <Field label="度数%"><input className={inputClass} type="number" value={selected.abv ?? ''} onChange={(event) => setSelected({ ...selected, abv: Number(event.target.value) || undefined })} /></Field>
                  <Field label="市場価格"><input className={inputClass} type="number" value={selected.adoptedMarketPrice ?? ''} onChange={(event) => setSelected({ ...selected, adoptedMarketPrice: Number(event.target.value) || undefined })} /></Field>
                </div>
                <Field label="コメント"><textarea className={`${inputClass} min-h-24`} value={selected.memo ?? ''} onChange={(event) => setSelected({ ...selected, memo: event.target.value })} /></Field>
                <button
                  className="rounded-md bg-gold px-4 py-3 font-bold text-ink"
                  onClick={() => void updateLogTransaction({ ...selected, status: selected.productName.trim() ? 'complete' : 'needs_review' }).then(() => { setIsEditing(false); setDetailStatus('編集内容を保存しました。'); })}
                >
                  編集内容を保存
                </button>
              </div>
            ) : <button className="mt-4 w-full rounded-md bg-gold px-4 py-3 font-bold text-ink" onClick={() => setIsEditing(true)}>この記録を編集</button>}
            <button
              className="mt-4 w-full rounded-md border border-red-300/20 px-4 py-3 text-red-200"
              onClick={() => setConfirmDelete(true)}
            >
              この記録を削除
            </button>
            {confirmDelete ? <div className="mt-3 rounded-md border border-red-300/30 p-3"><p className="text-sm text-red-100">写真と価格候補も削除します。元に戻せません。</p><div className="mt-3 grid grid-cols-2 gap-2"><button className="rounded-md bg-rice/10 px-3 py-2" onClick={() => setConfirmDelete(false)}>キャンセル</button><button className="rounded-md bg-red-900 px-3 py-2" onClick={() => void deleteLogTransaction(selected.logId).then(closeDetail).catch(() => setDetailStatus('削除に失敗しました。記録は残っています。'))}>削除する</button></div></div> : null}
            {detailStatus ? <p className="mt-3 rounded-md bg-gold/15 p-3 text-sm text-gold">{detailStatus}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dateTime(value?: string) {
  return value ? new Date(value).getTime() : 0;
}
