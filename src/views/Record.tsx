import { Camera, CheckCircle2, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RadarChart } from '../components/RadarChart';
import { Field, Section } from '../components/Section';
import { FEATURES } from '../config/features';
import { alcoholOptions, alcoholProfiles } from '../data/alcoholProfiles';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { findDuplicateLogs, saveLogTransaction } from '../services/logRepository';
import {
  createImportedPhotoDraftsSequential,
  imageTypeLabel,
  MAX_IMPORT_FILES,
  type PhotoImportProgress
} from '../services/photoImport';
import { historyPriceCandidates, manualPriceCandidate, searchRakutenPrices, selectedPriceSnapshot } from '../services/priceService';
import { createInitialFormState, initialScores, type RecordFormState } from '../services/recordForm';
import { averageScore, correctedScore, evaluateValue, pairingSuggestions, summarizePrices } from '../services/scoring';
import type {
  AlcoholType,
  CandidateMatch,
  ImageType,
  ImportedPhotoDraft,
  ImportMode,
  MarketPriceCandidate,
  SakeImage,
  SakeLog
} from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';
const imageTypeOptions: ImageType[] = ['frontLabel', 'backLabel', 'bottle', 'glass', 'food', 'receipt', 'other'];

export function Record({ importFiles = [], onImportQueueDone }: { importFiles?: File[]; onImportQueueDone?: () => void }) {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const logs = useLiveQuery(() => db.logs.toArray(), []);
  const [form, setForm] = useState<RecordFormState>(() => createInitialFormState('sake'));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [importMode, setImportMode] = useState<ImportMode | undefined>();
  const [drafts, setDrafts] = useState<ImportedPhotoDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failures, setFailures] = useState<Array<{ fileName: string; reason: string }>>([]);
  const [progress, setProgress] = useState<PhotoImportProgress | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [priceCandidates, setPriceCandidates] = useState<MarketPriceCandidate[]>([]);
  const [status, setStatus] = useState('');
  const [duplicateChoices, setDuplicateChoices] = useState<SakeLog[]>([]);
  const [savedLogId, setSavedLogId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | undefined>();

  const activeDraft = drafts[activeIndex];
  const profile = alcoholProfiles[form.alcoholType];
  const baseAverage = averageScore(form.scores);
  const correction = correctedScore(baseAverage, form.satisfactionScore, {
    food: form.foodPairing,
    mood: form.mood,
    priceImpression: form.priceImpression
  });
  const selectedCandidate = priceCandidates.find((candidate) => candidate.id === form.selectedMarketPriceCandidateId);
  const adoptedMarketPrice = selectedCandidate ? selectedCandidate.totalPrice ?? selectedCandidate.price : form.manualMarketPrice;
  const value = evaluateValue(form.satisfactionScore, adoptedMarketPrice);
  const pairings = pairingSuggestions(form.alcoholType, form.scores);

  const draftLog = useMemo(() => {
    const priceSummary = summarizePrices(priceCandidates);
    const selectedSnapshot = selectedPriceSnapshot(selectedCandidate, form.manualMarketPrice);
    return {
      logId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      drankAt: form.drankAt || undefined,
      capturedAt: form.capturedAt,
      importMode,
      alcoholType: form.alcoholType,
      productName: form.productName.trim(),
      makerName: form.makerName.trim() || undefined,
      region: form.region.trim() || undefined,
      volume: form.volume,
      abv: form.abv,
      purchasePrice: form.purchasePrice,
      ...priceSummary,
      selectedMarketPriceCandidateId: selectedSnapshot.candidateId,
      selectedMarketPriceSnapshot: selectedSnapshot,
      adoptedMarketPrice,
      marketPriceSource: selectedSnapshot.source === 'unfetched' ? undefined : selectedSnapshot.source,
      marketPriceFetchedAt: selectedSnapshot.fetchedAt,
      marketPriceCandidates: priceCandidates,
      valueScore: value.valueScore,
      priceConfidence: selectedSnapshot.priceConfidence,
      glassType: form.glassType,
      foodPairing: form.foodPairing,
      baseScores: form.scores,
      satisfactionScore: form.satisfactionScore,
      repeatScore: form.repeatScore,
      foodMatchScore: form.foodMatchScore,
      correctedScore: correction.score,
      correctionReason: correction.reason,
      generatedTexts: FEATURES.postTextGeneration ? { sns: '', oneLine: '', hashtags: [] } : undefined,
      postImagePath: FEATURES.postImageGeneration ? '' : undefined,
      memo: form.memo,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      userConfirmed: true
    } satisfies SakeLog;
  }, [adoptedMarketPrice, correction.reason, correction.score, form, importMode, priceCandidates, selectedCandidate, value.valueScore]);

  useEffect(() => {
    if (importFiles.length === 0) return;
    receiveFiles(importFiles);
    // importFiles is a one-shot value from Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importFiles]);

  useEffect(() => {
    return () => {
      drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      abortRef.current?.abort();
    };
  }, [drafts]);

  function receiveFiles(files: File[]) {
    if (files.length > MAX_IMPORT_FILES) {
      setStatus(`一度に選択できる写真は最大${MAX_IMPORT_FILES}枚です。枚数を減らしてください。`);
      return;
    }
    setPendingFiles(files);
    setImportMode(files.length > 1 ? undefined : 'separateLogs');
    if (files.length === 1) void startImport(files, 'separateLogs');
  }

  async function startImport(files = pendingFiles, mode = importMode) {
    if (!mode || files.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsImporting(true);
    setFailures([]);
    setStatus('写真を読み込んでいます。');
    resetFormState();

    try {
      const result = await createImportedPhotoDraftsSequential(files, {
        signal: controller.signal,
        onProgress: setProgress
      });
      setDrafts(result.drafts);
      setFailures(result.failures);
      setActiveIndex(0);
      setImportMode(mode);
      applyDraftToForm(result.drafts[0], mode);
      setStatus(result.failures.length ? '一部の写真は処理できませんでした。失敗一覧を確認してください。' : '写真の読み込みが完了しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '写真の処理に失敗しました。');
    } finally {
      setIsImporting(false);
    }
  }

  function cancelImport() {
    abortRef.current?.abort();
    setIsImporting(false);
    setStatus('写真処理をキャンセルしました。');
  }

  function retryFailed() {
    const failedFiles = pendingFiles.filter((file) => failures.some((failure) => failure.fileName === file.name));
    if (failedFiles.length) void startImport(failedFiles, importMode);
  }

  function resetFormState(nextType: AlcoholType = 'sake') {
    setForm(createInitialFormState(nextType));
    setPriceCandidates([]);
    setDuplicateChoices([]);
    setSavedLogId(undefined);
    setStatus('');
  }

  function applyDraftToForm(draft: ImportedPhotoDraft | undefined, mode: ImportMode) {
    if (!draft) return;
    setForm((current) => ({
      ...current,
      capturedAt: draft.capturedAt,
      drankAt: '',
      productName: '',
      makerName: '',
      volume: undefined,
      abv: undefined,
      selectedMarketPriceCandidateId: null
    }));
    if (mode === 'separateLogs') {
      setPriceCandidates([]);
      setDuplicateChoices([]);
    }
  }

  function applyCandidate(candidate: CandidateMatch) {
    setForm((current) => ({
      ...current,
      productName: candidate.productName ?? current.productName,
      makerName: candidate.makerName ?? current.makerName,
      alcoholType: candidate.alcoholType ?? current.alcoholType,
      scores: candidate.alcoholType && candidate.alcoholType !== current.alcoholType ? initialScores(candidate.alcoholType) : current.scores,
      volume: candidate.volume ?? current.volume,
      abv: candidate.abv ?? current.abv
    }));
  }

  function setCapturedDateAsDrankAt() {
    if (!form.capturedAt) return;
    setForm((current) => ({ ...current, drankAt: current.capturedAt ?? '' }));
  }

  async function searchPrice() {
    setIsSearching(true);
    setStatus('');
    try {
      const rakuten = await searchRakutenPrices({
        productName: form.productName,
        makerName: form.makerName,
        volume: form.volume,
        alcoholType: form.alcoholType,
        settings
      });
      const history = historyPriceCandidates(logs, form.productName, form.makerName);
      setPriceCandidates([...rakuten.candidates, ...history]);
      setForm((current) => ({ ...current, selectedMarketPriceCandidateId: null }));
      setStatus(rakuten.message ?? '価格候補を確認してください。');
    } finally {
      setIsSearching(false);
    }
  }

  async function saveLog(allowDuplicate = false) {
    if (isSaving || savedLogId) return;
    if (!form.productName.trim()) {
      setStatus('銘柄名を入力してください。');
      return;
    }

    const images = buildImageRecords(draftLog.logId);
    if (!allowDuplicate) {
      const duplicates = await findDuplicateLogs({
        imageHashes: images.map((image) => image.imageHash).filter(Boolean) as string[],
        productName: draftLog.productName,
        drankAt: draftLog.drankAt,
        volume: draftLog.volume,
        makerName: draftLog.makerName
      });
      if (duplicates.length) {
        setDuplicateChoices(duplicates);
        setStatus('同じ写真または近い内容の記録がすでにあります。重複登録するか確認してください。');
        return;
      }
    }

    setIsSaving(true);
    try {
      const candidatesToSave =
        form.manualMarketPrice && !selectedCandidate ? [...priceCandidates, manualPriceCandidate(form.manualMarketPrice)] : priceCandidates;
      await saveLogTransaction({ log: draftLog, images, priceCandidates: candidatesToSave });
      setSavedLogId(draftLog.logId);
      setStatus('酒ログを保存しました。');
    } catch (error) {
      setStatus(error instanceof Error ? `保存に失敗しました。入力内容は保持しています。${error.message}` : '保存に失敗しました。入力内容は保持しています。');
    } finally {
      setIsSaving(false);
    }
  }

  function buildImageRecords(logId: string): SakeImage[] {
    const sourceDrafts = importMode === 'singleLog' ? drafts : activeDraft ? [activeDraft] : [];
    return sourceDrafts.map((draft, index) => ({
      imageId: crypto.randomUUID(),
      logId,
      imageType: draft.imageType,
      originalBlob: draft.originalFile,
      processedBlob: draft.resizedBlob,
      backgroundMode: form.backgroundMode,
      fileName: draft.fileName,
      mimeType: draft.originalFile.type,
      fileSize: draft.originalFile.size,
      width: draft.width,
      height: draft.height,
      capturedAt: draft.capturedAt,
      imageHash: draft.imageHash,
      ocrText: draft.ocr.text,
      ocrConfidence: draft.ocr.confidence,
      createdFromImport: true,
      sortOrder: index,
      createdAt: new Date().toISOString()
    }));
  }

  function nextSeparatePhoto() {
    if (activeIndex + 1 >= drafts.length) {
      onImportQueueDone?.();
      resetFormState();
      setDrafts([]);
      setActiveIndex(0);
      return;
    }
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    resetFormState();
    applyDraftToForm(drafts[nextIndex], 'separateLogs');
  }

  function updateDraftType(id: string, imageType: ImageType) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, imageType } : draft)));
  }

  if (savedLogId) {
    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-lg p-6 text-center">
          <CheckCircle2 className="mx-auto text-gold" size={44} />
          <h1 className="mt-4 text-2xl font-black">酒ログを保存しました</h1>
          <div className="mt-5 grid gap-3">
            <button className="rounded-md bg-rice px-4 py-3 font-bold text-ink" onClick={() => setStatus(`保存済みID: ${savedLogId}`)}>
              ログ詳細を見る
            </button>
            <button
              className="rounded-md bg-moss px-4 py-3 font-bold text-rice"
              onClick={() => {
                if (importMode === 'separateLogs' && drafts.length > activeIndex + 1) nextSeparatePhoto();
                else {
                  resetFormState();
                  setDrafts([]);
                  setActiveIndex(0);
                  onImportQueueDone?.();
                }
              }}
            >
              新しいお酒を記録
            </button>
            <button className="rounded-md bg-rice/10 px-4 py-3 font-bold" onClick={() => onImportQueueDone?.()}>
              ホームへ戻る
            </button>
          </div>
          {status ? <p className="mt-4 rounded-md bg-gold/15 p-3 text-sm text-gold">{status}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-bold text-gold">記録フロー</p>
        <h1 className="mt-1 text-2xl font-black">写真と評価で、お酒の記録を作成</h1>
      </header>

      <Section title="1. 写真選択">
        <div className="glass-panel rounded-lg p-4">
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-rice px-4 py-4 font-bold text-ink">
            <Camera size={18} />
            写真を選択
            <input className="hidden" type="file" accept="image/*,.heic,.heif" multiple onChange={(event) => receiveFiles(Array.from(event.target.files ?? []))} />
          </label>

          {pendingFiles.length > 1 && !importMode ? (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-rice/70">複数写真の扱いを選択してください。</p>
              <button className="rounded-md bg-moss px-4 py-3 font-bold" onClick={() => void startImport(pendingFiles, 'singleLog')}>
                1つのお酒に複数写真を追加する
              </button>
              <button className="rounded-md bg-rice/10 px-4 py-3 font-bold" onClick={() => void startImport(pendingFiles, 'separateLogs')}>
                写真ごとに別のお酒として登録する
              </button>
            </div>
          ) : null}

          {isImporting && progress ? (
            <div className="mt-4 rounded-md bg-gold/15 p-3 text-sm text-gold">
              <p>{progress.index + 1} / {progress.total}枚を処理中</p>
              <p>{progress.message}{progress.ocrProgress !== undefined ? ` ${progress.ocrProgress}%` : ''}</p>
              <button className="mt-3 rounded-md bg-ink px-3 py-2 text-rice" onClick={cancelImport}>処理をキャンセル</button>
            </div>
          ) : null}

          {failures.length ? (
            <div className="mt-4 rounded-md bg-red-950/40 p-3 text-sm">
              <p className="font-bold text-red-200">処理できなかった写真</p>
              {failures.map((failure) => <p key={failure.fileName}>{failure.fileName}: {failure.reason}</p>)}
              <button className="mt-3 rounded-md bg-rice/10 px-3 py-2" onClick={retryFailed}>失敗分を再試行</button>
            </div>
          ) : null}

          {drafts.length ? (
            <div className="mt-4 grid gap-3">
              <p className="text-sm text-rice/70">{drafts.length}枚の写真を読み込み済み</p>
              {importMode === 'separateLogs' && <p className="text-sm font-bold text-gold">{activeIndex + 1} / {drafts.length}枚目を編集中</p>}
              <div className="grid grid-cols-3 gap-2">
                {(importMode === 'singleLog' ? drafts : activeDraft ? [activeDraft] : []).map((draft) => (
                  <div key={draft.id} className="rounded-md bg-rice/8 p-2">
                    <img src={draft.previewUrl} className="aspect-square w-full rounded object-cover" alt={draft.fileName} />
                    <select className={`${inputClass} mt-2 text-xs`} value={draft.imageType} onChange={(event) => updateDraftType(draft.id, event.target.value as ImageType)}>
                      {imageTypeOptions.map((type) => <option key={type} value={type}>{imageTypeLabel(type)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="2. OCR解析">
        <div className="rounded-lg bg-rice/8 p-4">
          <p className="text-sm text-rice/70">
            {activeDraft
              ? activeDraft.ocr.message
              : '写真を選択すると、ブラウザ内OCRでラベル文字を読み取ります。'}
          </p>
          <p className="mt-2 text-sm text-gold">撮影日: {form.capturedAt ?? '撮影日不明'}</p>
          {form.capturedAt ? <button className="mt-2 rounded-md bg-gold/15 px-3 py-2 text-sm font-bold text-gold" onClick={setCapturedDateAsDrankAt}>撮影日を飲酒日に設定</button> : null}
          {activeDraft?.ocr.text ? <textarea className={`${inputClass} mt-3 min-h-24`} value={activeDraft.ocr.text} readOnly /> : null}
          <div className="mt-3 grid gap-2">
            {activeDraft?.candidates.map((candidate) => (
              <button key={`${candidate.productName}-${candidate.matchReasons.join(',')}`} className="rounded-md bg-ink/70 p-3 text-left" onClick={() => applyCandidate(candidate)}>
                <span className="block font-bold">{candidate.productName ?? '候補名なし'}</span>
                <span className="text-xs text-rice/60">{candidate.matchReasons.join(' / ')} / 信頼度 {candidate.confidence}</span>
                {candidate.warning ? <span className="mt-1 block text-xs text-gold">{candidate.warning}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="3. 酒種">
        <div className="grid grid-cols-3 gap-2">
          {alcoholOptions.map((option) => (
            <button
              key={option.type}
              className={`rounded-md px-2 py-3 text-sm font-bold ${form.alcoholType === option.type ? 'bg-gold text-ink' : 'bg-rice/8 text-rice'}`}
              onClick={() => setForm((current) => ({ ...current, alcoholType: option.type, scores: initialScores(option.type) }))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="4. 銘柄情報">
        <div className="grid gap-3">
          <Field label="銘柄"><input className={inputClass} value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} /></Field>
          <Field label="蔵元・メーカー"><input className={inputClass} value={form.makerName} onChange={(event) => setForm({ ...form, makerName: event.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="産地"><input className={inputClass} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
            <Field label="飲酒日"><input className={inputClass} type="date" value={form.drankAt} onChange={(event) => setForm({ ...form, drankAt: event.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="容量ml"><input className={inputClass} type="number" value={form.volume ?? ''} onChange={(event) => setForm({ ...form, volume: Number(event.target.value) || undefined })} /></Field>
            <Field label="度数%"><input className={inputClass} type="number" value={form.abv ?? ''} onChange={(event) => setForm({ ...form, abv: Number(event.target.value) || undefined })} /></Field>
            <Field label="購入価格"><input className={inputClass} type="number" value={form.purchasePrice ?? ''} onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) || undefined })} /></Field>
          </div>
        </div>
      </Section>

      <Section title="5. 市場価格取得">
        <div className="space-y-3">
          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 font-bold" onClick={searchPrice} disabled={isSearching}>
            <Search size={18} />
            {isSearching ? '検索中' : '楽天市場APIで候補を検索'}
          </button>
          <Field label="手入力価格">
            <input className={inputClass} type="number" value={form.manualMarketPrice ?? ''} onChange={(event) => setForm({ ...form, manualMarketPrice: Number(event.target.value) || undefined, selectedMarketPriceCandidateId: null })} />
          </Field>
          {priceCandidates.map((candidate) => (
            <button
              key={candidate.id}
              className={`w-full rounded-md p-3 text-left ${form.selectedMarketPriceCandidateId === candidate.id ? 'bg-gold/20 ring-1 ring-gold' : 'bg-rice/8'}`}
              onClick={() => setForm({ ...form, selectedMarketPriceCandidateId: candidate.id, manualMarketPrice: undefined })}
            >
              <span className="block font-bold">{candidate.itemName}</span>
              <span className="text-sm text-rice/70">{candidate.shopName ?? candidate.source} / {(candidate.totalPrice ?? candidate.price).toLocaleString()}円 / 一致度 {candidate.matchScore}</span>
              <span className="mt-1 block text-xs text-gold">{candidate.recommended ? '推奨候補 / ' : ''}{candidate.matchReasons.join('、') || '一致理由なし'}</span>
              {candidate.excludedReasons.length ? <span className="mt-1 block text-xs text-red-200">注意: {candidate.excludedReasons.join('、')}</span> : null}
            </button>
          ))}
        </div>
      </Section>

      <Section title="6. 評価入力・味覚評価">
        <div className="grid gap-4">
          {profile.axes.map((axis) => (
            <label key={axis.key} className="rounded-lg bg-rice/7 p-4">
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-bold">{axis.label}</span>
                  <span className="text-xs text-rice/56">{axis.question}</span>
                </span>
                <strong className="text-2xl text-gold">{form.scores[axis.key]}</strong>
              </span>
              <input className="range-thumb mt-4 h-2 w-full appearance-none rounded-full bg-rice/18" type="range" min="1" max="6" value={form.scores[axis.key]} onChange={(event) => setForm({ ...form, scores: { ...form.scores, [axis.key]: Number(event.target.value) } })} />
            </label>
          ))}
        </div>
      </Section>

      <Section title="7. 香り評価・コスパ評価">
        <div className="grid gap-3">
          <ScoreInput label="総合満足度" value={form.satisfactionScore} onChange={(value) => setForm({ ...form, satisfactionScore: value })} />
          <ScoreInput label="また飲みたい度" value={form.repeatScore} onChange={(value) => setForm({ ...form, repeatScore: value })} />
          <ScoreInput label="料理と合わせたい度" value={form.foodMatchScore} onChange={(value) => setForm({ ...form, foodMatchScore: value })} />
          <Field label="合わせた料理"><input className={inputClass} value={form.foodPairing} onChange={(event) => setForm({ ...form, foodPairing: event.target.value })} /></Field>
          <Field label="グラス"><input className={inputClass} value={form.glassType} onChange={(event) => setForm({ ...form, glassType: event.target.value })} /></Field>
          <Field label="その日の気分"><input className={inputClass} value={form.mood} onChange={(event) => setForm({ ...form, mood: event.target.value })} /></Field>
          <Field label="価格印象"><input className={inputClass} value={form.priceImpression} onChange={(event) => setForm({ ...form, priceImpression: event.target.value })} /></Field>
        </div>
      </Section>

      <Section title="8. レーダーチャート">
        <div className="glass-panel rounded-lg p-4">
          <div className="h-72"><RadarChart type={form.alcoholType} scores={form.scores} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="基礎評価" value={baseAverage} />
            <Metric label="補正後" value={correction.score} />
            <Metric label="コスパ" value={value.valueScore} />
          </div>
          <p className="mt-3 text-sm leading-6 text-rice/70">{correction.reason}</p>
        </div>
      </Section>

      <Section title="9. ペアリング">
        <div className="rounded-lg bg-rice/8 p-4">
          <div className="flex flex-wrap gap-2">
            {pairings.map((pairing) => <span key={pairing} className="rounded-full bg-gold/15 px-3 py-2 text-sm font-bold text-gold">{pairing}</span>)}
          </div>
        </div>
      </Section>

      <Section title="10. コメント">
        <div className="grid gap-3">
          <Field label="タグ（カンマ区切り）"><input className={inputClass} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></Field>
          <Field label="記録コメント"><textarea className={`${inputClass} min-h-24`} value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field>
        </div>
      </Section>

      <Section title="11. 保存">
        <div className="grid gap-3">
          {duplicateChoices.length ? (
            <div className="rounded-md bg-gold/15 p-3 text-sm text-gold">
              <p className="font-bold">同じ写真を使用した記録がすでにあります。重複登録しますか？</p>
              {duplicateChoices.slice(0, 3).map((log) => <p key={log.logId}>{log.productName} / {log.drankAt ?? '日付未設定'}</p>)}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded-md bg-rice/10 px-3 py-2" onClick={() => setStatus(`既存ログID: ${duplicateChoices[0]?.logId}`)}>既存ログを確認</button>
                <button className="rounded-md bg-gold px-3 py-2 font-bold text-ink" onClick={() => void saveLog(true)}>重複して保存する</button>
              </div>
              <button className="mt-2 flex items-center gap-2 text-rice/70" onClick={() => setDuplicateChoices([])}><XCircle size={16} />キャンセル</button>
            </div>
          ) : null}
          <button className="rounded-md bg-rice px-4 py-4 font-black text-ink disabled:opacity-50" onClick={() => void saveLog()} disabled={isSaving || Boolean(savedLogId)}>
            {isSaving ? '保存中…' : '保存'}
          </button>
          {status ? <p className="rounded-md bg-gold/15 p-3 text-sm text-gold">{status}</p> : null}
        </div>
      </Section>
    </div>
  );
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="rounded-lg bg-rice/7 p-4">
      <span className="flex items-center justify-between font-bold">
        {label}
        <strong className="text-2xl text-gold">{value}</strong>
      </span>
      <input className="range-thumb mt-4 h-2 w-full appearance-none rounded-full bg-rice/18" type="range" min="1" max="6" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-ink/65 p-3">
      <p className="text-xs text-rice/52">{label}</p>
      <p className="mt-1 text-xl font-black text-gold">{value}</p>
    </div>
  );
}
