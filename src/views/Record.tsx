import { Camera, CheckCircle2, RotateCw, ScanLine, Search, XCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RadarChart } from '../components/RadarChart';
import { Field, Section } from '../components/Section';
import { FEATURES } from '../config/features';
import { alcoholOptions, alcoholProfiles } from '../data/alcoholProfiles';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { findDuplicateLogs, saveLogTransaction } from '../services/logRepository';
import { deleteDraft, hydratePhotos, isDraftDirty, loadDraft, saveDraft, serializePhotos } from '../services/draftService';
import { recordClassificationCorrection, recordOcrCorrection } from '../services/ocrLearning';
import { cropPerspectiveQuad } from '../services/labelRegionService';
import { aggregatePhotoOcr, emptyAggregatedOcr } from '../services/ocrAggregation';
import { determineLearningDecision, recordIdentificationRun, recordLearningDecision } from '../services/identificationLearningService';
import { mergePhotoDraft, mergePhotoDrafts, uniqueImportFiles } from '../services/photoQueue';
import {
  createImportedPhotoDraftsSequential,
  createNativeCapturedPhotoDraft,
  imageTypeLabel,
  MAX_IMPORT_FILES,
  photoFileKey,
  reanalyzePhotoDraft,
  type PhotoImportProgress
} from '../services/photoImport';
import { captureLabelPhoto } from '../services/smartCaptureService';
import { historyPriceCandidates, manualPriceCandidate, searchRakutenPrices, selectedPriceSnapshot } from '../services/priceService';
import { createInitialFormState, initialScores, type RecordFormState } from '../services/recordForm';
import { averageScore, correctedScore, evaluateValue, pairingSuggestions, summarizePrices } from '../services/scoring';
import type {
  AlcoholType,
  CandidateMatch,
  ImageType,
  ImportedPhotoDraft,
  IdentificationPhotoType,
  ImportMode,
  MarketPriceCandidate,
  PerspectiveQuad,
  SakeImage,
  SakeLog
} from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';
const imageTypeOptions: ImageType[] = ['frontLabel', 'backLabel', 'bottle', 'glass', 'food', 'receipt', 'other'];

export function Record({
  importFiles = [],
  resumeDraftId,
  onImportQueueDone,
  onOpenLogDetail,
  onStartNewRecord,
  onGoHome
}: {
  importFiles?: File[];
  resumeDraftId?: string;
  onImportQueueDone?: () => void;
  onOpenLogDetail: (logId: string) => void;
  onStartNewRecord: () => void;
  onGoHome: () => void;
}) {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const logs = useLiveQuery(() => db.logs.toArray(), []);
  const [form, setForm] = useState<RecordFormState>(() => createInitialFormState('sake'));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [importMode, setImportMode] = useState<ImportMode | undefined>();
  const [drafts, setDrafts] = useState<ImportedPhotoDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failures, setFailures] = useState<Array<{ fileName: string; fileKey: string; reason: string }>>([]);
  const [progress, setProgress] = useState<PhotoImportProgress | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [priceCandidates, setPriceCandidates] = useState<MarketPriceCandidate[]>([]);
  const [selectedProductCandidate, setSelectedProductCandidate] = useState<CandidateMatch>();
  const [status, setStatus] = useState('');
  const [duplicateChoices, setDuplicateChoices] = useState<SakeLog[]>([]);
  const [savedLogId, setSavedLogId] = useState<string | undefined>();
  const [draftId, setDraftId] = useState(() => resumeDraftId ?? crypto.randomUUID());
  const [draftReady, setDraftReady] = useState(!resumeDraftId);
  const [draftStatus, setDraftStatus] = useState('');
  const [cropQuad, setCropQuad] = useState<PerspectiveQuad>(() => defaultCropQuad());
  const [cropRotation, setCropRotation] = useState(0);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [showLensAssist, setShowLensAssist] = useState(false);
  const abortRef = useRef<AbortController | undefined>();
  const draftsRef = useRef<ImportedPhotoDraft[]>([]);
  const draftCreatedAtRef = useRef(new Date().toISOString());
  const draftRevisionRef = useRef(0);
  const logIdRef = useRef(crypto.randomUUID());
  const saveOperationIdRef = useRef(crypto.randomUUID());
  const initialFormRef = useRef(createInitialFormState('sake'));

  const activeDraft = drafts[activeIndex];
  const [aggregatedOcr, setAggregatedOcr] = useState(emptyAggregatedOcr);
  const displayedCandidates = importMode === 'singleLog' ? aggregatedOcr.candidates : activeDraft?.candidates ?? [];
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

  async function scanLabel() {
    if (isScanning) return;
    setIsScanning(true);
    setStatus('ラベルを撮影しています。');
    try {
      const capture = await captureLabelPhoto('frontLabel');
      const draft = await createNativeCapturedPhotoDraft(capture);
      setDrafts([draft]);
      setImportMode('singleLog');
      setActiveIndex(0);
      setForm((current) => ({ ...current, capturedAt: draft.capturedAt }));
      setStatus(capture.warnings.length ? capture.warnings.join(' ') : '端末内でラベルを解析しました。候補を確認してください。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ラベルを撮影できませんでした。');
    } finally {
      setIsScanning(false);
    }
  }

  const draftLog = useMemo(() => {
    const priceSummary = summarizePrices(priceCandidates);
    const selectedSnapshot = selectedPriceSnapshot(selectedCandidate, form.manualMarketPrice);
    return {
      logId: logIdRef.current,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      drankAt: form.drankAt || undefined,
      capturedAt: form.capturedAt,
      importMode,
      alcoholType: form.alcoholType,
      productName: form.productName.trim(),
      makerName: form.makerName.trim() || undefined,
      region: form.region.trim() || undefined,
      country: form.country.trim() || undefined,
      prefecture: form.prefecture.trim() || undefined,
      ingredients: form.ingredients.trim() || undefined,
      ricePolishingRatio: form.ricePolishingRatio.trim() || undefined,
      sakeMeterValue: form.sakeMeterValue.trim() || undefined,
      acidity: form.acidity.trim() || undefined,
      grapeVariety: form.grapeVariety.trim() || undefined,
      shochuMaterial: form.shochuMaterial.trim() || undefined,
      beerStyle: form.beerStyle.trim() || undefined,
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
      userConfirmed: true,
      status: 'complete',
      saveOperationId: saveOperationIdRef.current
    } satisfies SakeLog;
  }, [adoptedMarketPrice, correction.reason, correction.score, form, importMode, priceCandidates, selectedCandidate, value.valueScore]);

  useEffect(() => {
    if (importFiles.length === 0) return;
    receiveFiles(importFiles);
    // importFiles is a one-shot value from Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importFiles]);

  useEffect(() => {
    if (!resumeDraftId) return;
    let active = true;
    void loadDraft(resumeDraftId).then(({ draft, error }) => {
      if (!active) return;
      if (draft) {
        setForm({ ...createInitialFormState((draft.formState.alcoholType as AlcoholType | undefined) ?? 'sake'), ...(draft.formState as unknown as RecordFormState) });
        setDrafts(hydratePhotos(draft.photos));
        setImportMode(draft.importMode);
        setActiveIndex(draft.activeImageIndex ?? 0);
        setPriceCandidates((draft.formState.priceCandidates as MarketPriceCandidate[] | undefined) ?? []);
        draftCreatedAtRef.current = draft.createdAt;
        draftRevisionRef.current = draft.revision ?? 0;
        setDraftStatus('入力途中の記録を復元しました。');
      } else if (error) setDraftStatus(error);
      setDraftReady(true);
    });
    return () => {
      active = false;
    };
  }, [resumeDraftId]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const controller = new AbortController();
    const selectedDrafts = importMode === 'singleLog' ? drafts : activeDraft ? [activeDraft] : [];
    void aggregatePhotoOcr(selectedDrafts, controller.signal)
      .then(setAggregatedOcr)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setAggregatedOcr(emptyAggregatedOcr);
      });
    return () => controller.abort();
  }, [activeDraft, drafts, importMode]);

  useEffect(() => {
    const region = activeDraft?.labelRegions?.find((item) => item.kind === 'center' || item.kind === 'manual');
    if (region) setCropQuad(quadFromRegion(region));
  }, [activeDraft?.id, activeDraft?.labelRegions]);

  useEffect(() => {
    if (!draftReady || savedLogId || !isDraftDirty(form as unknown as Record<string, unknown>, initialFormRef.current as unknown as Record<string, unknown>, drafts.length, priceCandidates.length)) return;
    const timer = window.setTimeout(() => {
      void persistCurrentDraft('editing');
    }, 750);
    return () => window.clearTimeout(timer);
    // persistCurrentDraft intentionally reads the current render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, draftReady, drafts, form, importMode, priceCandidates, savedLogId]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void persistCurrentDraft('paused');
    };
    const pagehide = () => void persistCurrentDraft('paused');
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', pagehide);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', pagehide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, draftId, drafts, form, importMode, priceCandidates]);

  useEffect(() => {
    return () => {
      draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      abortRef.current?.abort();
    };
  }, []);

  async function persistCurrentDraft(nextStatus: 'editing' | 'paused' | 'ready') {
    if (!draftReady || savedLogId || !isDraftDirty(form as unknown as Record<string, unknown>, initialFormRef.current as unknown as Record<string, unknown>, drafts.length, priceCandidates.length)) return;
    try {
      const revision = ++draftRevisionRef.current;
      await saveDraft({
        id: draftId,
        source: drafts.length ? 'photo-import' : 'manual',
        importMode,
        formState: { ...form, priceCandidates },
        photos: serializePhotos(drafts),
        activeImageIndex: activeIndex,
        queueState: { total: drafts.length + failures.length, processed: drafts.length, failed: failures.length },
        createdAt: draftCreatedAtRef.current,
        updatedAt: new Date().toISOString(),
        status: nextStatus,
        schemaVersion: 1,
        revision
      });
      setDraftStatus('入力内容を端末内に自動保存しました。');
    } catch {
      setDraftStatus('自動保存に失敗しました。入力画面はそのまま保持しています。');
    }
  }

  function receiveFiles(files: File[]) {
    files = uniqueImportFiles(files);
    if (files.length > MAX_IMPORT_FILES) {
      setStatus(`一度に選択できる写真は最大${MAX_IMPORT_FILES}枚です。枚数を減らしてください。`);
      return;
    }
    setPendingFiles(files);
    setImportMode(files.length > 1 ? undefined : 'separateLogs');
    if (files.length === 1) void startImport(files, 'separateLogs');
  }

  async function startImport(files = pendingFiles, mode = importMode, preserveExisting = false) {
    if (!mode || files.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsImporting(true);
    if (!preserveExisting) setFailures([]);
    if (!preserveExisting) setDrafts([]);
    setStatus('写真を読み込んでいます。');
    if (!preserveExisting) resetFormState();
    let firstDisplayed = false;

    try {
      const result = await createImportedPhotoDraftsSequential(files, {
        signal: controller.signal,
        onProgress: setProgress,
        onDraftUpdate: (draft) => {
          setDrafts((current) => mergePhotoDraft(preserveExisting ? current : current.filter((item) => !files.some((file) => photoFileKey(file) === item.fileKey)), draft));
          if (!firstDisplayed) {
            firstDisplayed = true;
            setActiveIndex(0);
            setImportMode(mode);
            applyDraftToForm(draft, mode);
            setStatus('最初の写真を表示しました。残りは順番に処理しています。');
          }
        }
      });
      setDrafts((current) => mergePhotoDrafts(preserveExisting ? current : current, result.drafts));
      setFailures((current) => preserveExisting ? [...current.filter((failure) => !files.some((file) => photoFileKey(file) === failure.fileKey)), ...result.failures] : result.failures);
      if (!preserveExisting) setActiveIndex(0);
      setImportMode(mode);
      if (!firstDisplayed) applyDraftToForm(result.drafts[0], mode);
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
    const failedFiles = pendingFiles.filter((file) => failures.some((failure) => failure.fileKey === photoFileKey(file)));
    if (failedFiles.length) void startImport(failedFiles, importMode, true);
  }

  function resetFormState(nextType: AlcoholType = 'sake') {
    const initial = createInitialFormState(nextType);
    setForm(initial);
    initialFormRef.current = initial;
    setPriceCandidates([]);
    setSelectedProductCandidate(undefined);
    setDuplicateChoices([]);
    setSavedLogId(undefined);
    setStatus('');
    setDraftId(crypto.randomUUID());
    draftCreatedAtRef.current = new Date().toISOString();
    draftRevisionRef.current = 0;
    logIdRef.current = crypto.randomUUID();
    saveOperationIdRef.current = crypto.randomUUID();
    setDraftStatus('');
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
    setSelectedProductCandidate(candidate);
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

  async function saveLog(allowDuplicate = false, logStatus: 'complete' | 'incomplete' | 'needs_review' = 'complete') {
    if (isSaving || savedLogId) return;
    if (logStatus === 'complete' && !form.productName.trim()) {
      setStatus('銘柄名を入力してください。');
      return;
    }
    if (logStatus !== 'complete' && !form.productName.trim() && !activeDraft?.ocr.text && drafts.length === 0) {
      setStatus('「あとで編集」で保存するには、写真・銘柄名・OCR文字列のいずれかが必要です。');
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
      const log = { ...draftLog, productName: draftLog.productName || '銘柄未入力', status: logStatus };
      const saved = await saveLogTransaction({ log, images, priceCandidates: candidatesToSave });
      setSavedLogId(saved.logId);
      const warnings: string[] = [];
      if (form.productName.trim()) {
        const runId = await recordIdentificationRun({
          imageIds: images.map((image) => image.imageId), text:aggregatedOcr.text,
          barcodes:[...new Set(drafts.flatMap((draft) => draft.barcodeValues ?? []))],
          candidates:displayedCandidates, processingTimeMs:drafts.reduce((sum, draft) => sum + (draft.processing?.totalMs ?? 0), 0)
        });
        const referenceDraft = activeDraft?.visualFingerprint ? activeDraft : drafts.find((draft) => draft.visualFingerprint);
        const decision = determineLearningDecision(selectedProductCandidate, { productName:form.productName, makerName:form.makerName });
        await recordLearningDecision({
          candidate:selectedProductCandidate,
          runId,
          decision,
          finalProductName:form.productName,
          finalMakerName:form.makerName,
          finalAlcoholType:form.alcoholType,
          reference:referenceDraft?.visualFingerprint ? {
            imageHash:referenceDraft.imageHash,
            sourceImageId:referenceDraft.id,
            fingerprint:referenceDraft.visualFingerprint,
            photoType:referenceDraft.identificationPhotoType ?? referenceDraft.imageType,
            qualityLevel:referenceDraft.quality?.qualityLevel,
            learningEventId:`${saved.logId}|${referenceDraft.imageHash}|${selectedProductCandidate?.productId ?? form.productName}`
          } : undefined
        })
          .catch(() => warnings.push('確認済み商品マスターの更新だけ失敗しました。'));
      }
      if (aggregatedOcr.text && form.productName.trim()) {
        const eventId = `${saved.logId}|${activeDraft?.imageHash ?? 'manual'}|${form.productName.trim()}`;
        await recordOcrCorrection({
          observedText: aggregatedOcr.text,
          productName: form.productName,
          makerName: form.makerName,
          alcoholType: form.alcoholType,
          learningEventId: eventId
        }).catch(() => warnings.push('OCR修正辞書の更新だけ失敗しました。'));
      }
      for (const draft of drafts.filter((item) => item.classificationConfirmed && item.classification && item.classification.type !== item.imageType)) {
        await recordClassificationCorrection(
          draft.ocr.text.slice(0, 32),
          draft.classification!.type,
          draft.imageType,
          `${saved.logId}|${draft.imageHash}|classification`
        ).catch(() => warnings.push(`${draft.fileName}の分類学習だけ失敗しました。`));
      }
      await deleteDraft(draftId).catch(() => warnings.push('保存済みですが、入力途中データの削除だけ失敗しました。'));
      setStatus(`${logStatus === 'complete' ? '酒ログを保存しました。' : 'あとで編集する記録として保存しました。'}${warnings.length ? ` ${warnings.join(' ')}` : ''}`);
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
    setDrafts((current) => current.map((draft) => {
      if (draft.id !== id) return draft;
      return { ...draft, imageType, classificationConfirmed: true };
    }));
  }

  async function reanalyze(mode: 'standard' | 'vertical' | 'latin') {
    if (!activeDraft || isReanalyzing) return;
    setIsReanalyzing(true);
    setStatus(mode === 'vertical' ? '縦書きモデルを準備しています。' : mode === 'latin' ? '英字主体で再解析しています。' : '指定範囲を再解析しています。');
    try {
      const updated = await reanalyzePhotoDraft(activeDraft, { quad:cropQuad, rotateDegrees:cropRotation, mode });
      setDrafts((current) => current.map((draft) => draft.id === updated.id ? updated : draft));
      setStatus(updated.message ?? '再解析しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '再解析できませんでした。');
    } finally { setIsReanalyzing(false); }
  }

  async function exportLabelForManualCheck() {
    if (!activeDraft) return;
    const blob = await cropPerspectiveQuad(activeDraft.resizedBlob, cropQuad, cropRotation);
    const file = new File([blob], `sake-label-${activeDraft.imageHash.slice(0,10)}.jpg`, { type:'image/jpeg' });
    if (navigator.canShare?.({ files:[file] })) {
      await navigator.share({ files:[file], title:'SAKEログ ラベル確認用画像' });
      setStatus('端末の共有先を開きました。外部サービスへ渡す操作は共有先で確認してください。');
      setShowLensAssist(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('ラベル画像を書き出しました。Google Lensアプリで画像を選び、確認結果を銘柄欄へ入力してください。');
    setShowLensAssist(false);
  }

  if (savedLogId) {
    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-lg p-6 text-center">
          <CheckCircle2 className="mx-auto text-gold" size={44} />
          <h1 className="mt-4 text-2xl font-black">酒ログを保存しました</h1>
          <div className="mt-5 grid gap-3">
            <button className="rounded-md bg-rice px-4 py-3 font-bold text-ink" onClick={() => onOpenLogDetail(savedLogId)}>
              ログ詳細を見る
            </button>
            <button
              className="rounded-md bg-moss px-4 py-3 font-bold text-rice"
              onClick={() => {
                if (importMode === 'separateLogs' && drafts.length > activeIndex + 1) nextSeparatePhoto();
                else onStartNewRecord();
              }}
            >
              新しいお酒を記録
            </button>
            <button className="rounded-md bg-rice/10 px-4 py-3 font-bold" onClick={onGoHome}>
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
          {Capacitor.isNativePlatform() ? (
            <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-4 font-bold text-ink disabled:opacity-50" disabled={isScanning} onClick={() => void scanLabel()}>
              <ScanLine size={18} />
              {isScanning ? 'ラベルを解析中…' : 'ラベルをスキャン'}
            </button>
          ) : null}
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
                  <div key={draft.id} className={`rounded-md bg-rice/8 p-2 ${draft.id === activeDraft?.id ? 'ring-1 ring-gold' : ''}`}>
                    <button className="w-full" onClick={() => setActiveIndex(Math.max(0, drafts.findIndex((item) => item.id === draft.id)))}>
                      <img src={draft.previewUrl} className="aspect-square w-full rounded object-cover" alt={draft.fileName} />
                    </button>
                    {draft.status === 'processing' ? <p className="mt-2 text-xs text-gold">OCR処理中</p> : null}
                    {draft.classification ? (
                      <p className="mt-2 text-xs text-gold">
                        {imageTypeLabel(draft.classification.type)}の可能性 {draft.classification.confidence}%
                      </p>
                    ) : null}
                    {draft.identificationPhotoType && draft.identificationPhotoType !== draft.imageType ? <p className="mt-1 text-[11px] text-rice/55">詳細分類: {identificationPhotoTypeLabel(draft.identificationPhotoType)} {draft.identificationPhotoTypeConfidence ?? 0}%</p> : null}
                    <select className={`${inputClass} mt-2 text-xs`} value={draft.imageType} onChange={(event) => updateDraftType(draft.id, event.target.value as ImageType)}>
                      {imageTypeOptions.map((type) => <option key={type} value={type}>{imageTypeLabel(type)}</option>)}
                    </select>
                    <p className="mt-1 text-[11px] text-rice/50">{draft.classificationConfirmed ? '分類確認済み' : '分類未確認'}</p>
                  </div>
                ))}
              </div>
              {FEATURES.manualLensAssist ? <button className="w-full rounded bg-rice/10 px-3 py-2 text-xs font-bold" onClick={() => setShowLensAssist(true)}>Google Lensで手動確認</button> : null}
            </div>
          ) : null}
          {showLensAssist && activeDraft ? (
            <div className="mt-4 rounded-md border border-gold/35 bg-ink p-4 text-sm">
              <p className="font-bold text-gold">外部アプリで確認</p>
              <p className="mt-2 leading-6 text-rice/70">この操作では、選択したラベル画像を端末へ書き出します。画像は自動的には送信されません。Google Lensへの読込みと検索結果の確認は、ご自身の操作で行ってください。</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded bg-gold px-3 py-2 font-bold text-ink" onClick={() => void exportLabelForManualCheck()}>共有先を選ぶ</button>
                <button className="rounded bg-rice/10 px-3 py-2" onClick={() => setShowLensAssist(false)}>閉じる</button>
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="2. ローカル銘柄識別">
        <div className="rounded-lg bg-rice/8 p-4">
          <p className="mb-3 rounded-md bg-moss/35 p-3 text-xs leading-5 text-rice/80">画像解析は端末内で実行されます。画像は外部サーバーへ送信されません。</p>
          <p className="text-sm text-rice/70">
            {activeDraft
              ? activeDraft.ocr.message
              : '写真を選択すると、ブラウザ内OCRでラベル文字を読み取ります。'}
          </p>
          <p className="mt-2 text-sm text-gold">撮影日: {form.capturedAt ?? '撮影日不明'}</p>
          {form.capturedAt ? <button className="mt-2 rounded-md bg-gold/15 px-3 py-2 text-sm font-bold text-gold" onClick={setCapturedDateAsDrankAt}>撮影日を飲酒日に設定</button> : null}
          {activeDraft?.ocr.text ? <textarea className={`${inputClass} mt-3 min-h-24`} value={activeDraft.ocr.text} readOnly /> : null}
          {activeDraft ? (
            <p className="mt-2 text-sm font-bold">
              OCRエンジン信頼度 {Math.round(activeDraft.ocr.confidence * 100)}%
            </p>
          ) : null}
          {activeDraft?.identificationPath ? <p className="mt-1 text-xs text-rice/50">解析経路: {activeDraft.identificationPath === 'fast' ? '高速' : activeDraft.identificationPath === 'standard' ? '標準' : '詳細'}</p> : null}
          {activeDraft?.ocr.preprocessing?.length ? <p className="mt-1 text-xs text-rice/50">前処理: {activeDraft.ocr.preprocessing.join(' / ')}</p> : null}
          {activeDraft?.quality ? (
            <div className="mt-3 rounded-md bg-ink/50 p-3 text-xs text-rice/65">
              <p className="font-bold text-gold">画像品質</p>
              <p>鮮明度 {Math.round(activeDraft.quality.blurScore * 100)} / 明るさ {Math.round(activeDraft.quality.brightnessScore * 100)} / コントラスト {Math.round(activeDraft.quality.contrastScore * 100)}</p>
              {activeDraft.quality.warnings.length ? <p className="mt-1 text-red-200">注意: {activeDraft.quality.warnings.join(' / ')}</p> : <p className="mt-1">重大な品質警告なし</p>}
            </div>
          ) : null}
          {activeDraft && (displayedCandidates.length === 0 || (displayedCandidates[0]?.calibratedConfidence ?? 0) < 86) ? (
            <div className="mt-4 space-y-3 rounded-md border border-gold/25 bg-ink/50 p-3">
              <div className="flex items-center gap-2 font-bold text-gold"><ScanLine size={17} />ラベル範囲を指定して再解析</div>
              <CropEditor draft={activeDraft} quad={cropQuad} onChange={setCropQuad} />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <p className="text-xs text-rice/55">四隅をドラッグしてラベルだけを囲んでください。</p>
                <button className="flex items-center gap-1 rounded bg-rice/10 px-3 py-2 text-xs" onClick={() => setCropRotation((current) => (current + 90) % 360)}><RotateCw size={15} />{cropRotation}°</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="rounded bg-rice/10 px-3 py-2 text-xs" onClick={() => setCropQuad(defaultCropQuad())}>範囲をリセット</button>
                <button className="rounded bg-rice/10 px-3 py-2 text-xs" onClick={() => {
                  const region=activeDraft.labelRegions?.[0];
                  if (region) setCropQuad(quadFromRegion(region));
                }}>自動範囲を使う</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button disabled={isReanalyzing} className="rounded bg-gold px-2 py-2 text-xs font-bold text-ink disabled:opacity-50" onClick={() => void reanalyze('standard')}>表ラベル</button>
                <button disabled={isReanalyzing} className="rounded bg-rice/10 px-2 py-2 text-xs disabled:opacity-50" onClick={() => void reanalyze('vertical')}>縦書き</button>
                <button disabled={isReanalyzing} className="rounded bg-rice/10 px-2 py-2 text-xs disabled:opacity-50" onClick={() => void reanalyze('latin')}>英字主体</button>
              </div>
            </div>
          ) : null}
          {importMode === 'singleLog' && drafts.length > 1 ? (
            <div className="mt-3 rounded-md bg-ink/50 p-3 text-xs text-rice/65">
              <p className="font-bold text-gold">複数写真の証拠を統合</p>
              {aggregatedOcr.sources.volume ? <p>容量: {aggregatedOcr.sources.volume}</p> : null}
              {aggregatedOcr.sources.abv ? <p>度数: {aggregatedOcr.sources.abv}</p> : null}
            </div>
          ) : null}
          {activeDraft && displayedCandidates.length === 0 && !isReanalyzing ? (
            <p className="mt-3 rounded-md border border-gold/25 bg-ink/60 p-3 text-sm text-rice/75">
              銘柄を特定できませんでした。手入力してください。
            </p>
          ) : null}
          <div className="mt-3 grid gap-2">
            {displayedCandidates.map((candidate) => (
              <button key={`${candidate.productName}-${candidate.matchReasons.join(',')}`} className="rounded-md bg-ink/70 p-3 text-left" onClick={() => applyCandidate(candidate)}>
                <span className="block font-bold">{candidate.productName ?? '候補名なし'}</span>
                <span className="text-xs text-rice/60">
                  一致スコア {candidate.totalConfidence ?? 0} / 100・要確認 / {candidate.matchReasons.join(' / ')}
                </span>
                <span className="mt-1 block text-xs text-rice/50">
                  OCR {Math.round((candidate.ocrConfidence ?? 0) * 100)}%・銘柄一致 {candidate.productConfidence ?? 0}{candidate.makerConfidence !== undefined ? `・蔵元根拠 ${candidate.makerConfidence}` : ''}{candidate.volumeConfidence !== undefined ? `・容量根拠 ${candidate.volumeConfidence}` : ''}
                </span>
                {candidate.mismatchReasons?.length ? <span className="mt-1 block text-xs text-red-200">不一致: {candidate.mismatchReasons.join(' / ')}</span> : null}
                <span className="mt-1 block text-xs text-gold">候補は自動確定されません。内容を確認してください。</span>
                {candidate.warning ? <span className="mt-1 block text-xs text-gold">{candidate.warning}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="3. 銘柄情報の確認">
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

      <Section title="銘柄・蔵元・飲酒日の確認">
        <div className="grid gap-3">
          <Field label="銘柄"><input className={inputClass} value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} /></Field>
          <Field label="蔵元・メーカー"><input className={inputClass} value={form.makerName} onChange={(event) => setForm({ ...form, makerName: event.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="産地"><input className={inputClass} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
            <Field label="飲酒日"><input className={inputClass} type="date" value={form.drankAt} onChange={(event) => setForm({ ...form, drankAt: event.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="国"><input className={inputClass} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
            <Field label="都道府県"><input className={inputClass} value={form.prefecture} onChange={(event) => setForm({ ...form, prefecture: event.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="容量ml"><input className={inputClass} type="number" value={form.volume ?? ''} onChange={(event) => setForm({ ...form, volume: Number(event.target.value) || undefined })} /></Field>
            <Field label="度数%"><input className={inputClass} type="number" value={form.abv ?? ''} onChange={(event) => setForm({ ...form, abv: Number(event.target.value) || undefined })} /></Field>
            <Field label="購入価格"><input className={inputClass} type="number" value={form.purchasePrice ?? ''} onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) || undefined })} /></Field>
          </div>
          <Field label="原材料"><input className={inputClass} value={form.ingredients} onChange={(event) => setForm({ ...form, ingredients: event.target.value })} /></Field>
          {form.alcoholType === 'sake' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="精米歩合"><input className={inputClass} value={form.ricePolishingRatio} onChange={(event) => setForm({ ...form, ricePolishingRatio: event.target.value })} /></Field>
              <Field label="日本酒度"><input className={inputClass} value={form.sakeMeterValue} onChange={(event) => setForm({ ...form, sakeMeterValue: event.target.value })} /></Field>
              <Field label="酸度"><input className={inputClass} value={form.acidity} onChange={(event) => setForm({ ...form, acidity: event.target.value })} /></Field>
            </div>
          ) : null}
          {form.alcoholType === 'wine' ? <Field label="品種"><input className={inputClass} value={form.grapeVariety} onChange={(event) => setForm({ ...form, grapeVariety: event.target.value })} /></Field> : null}
          {form.alcoholType === 'shochu' ? <Field label="焼酎原料"><input className={inputClass} value={form.shochuMaterial} onChange={(event) => setForm({ ...form, shochuMaterial: event.target.value })} /></Field> : null}
          {form.alcoholType === 'beer' ? <Field label="ビールスタイル"><input className={inputClass} value={form.beerStyle} onChange={(event) => setForm({ ...form, beerStyle: event.target.value })} /></Field> : null}
        </div>
      </Section>

      <Section title="市場価格の確認">
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

      <Section title="4. 評価入力">
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

      <Section title="満足度・コスパ評価">
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

      <Section title="味覚レーダーチャート">
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

      <Section title="料理ペアリング">
        <div className="rounded-lg bg-rice/8 p-4">
          <div className="flex flex-wrap gap-2">
            {pairings.map((pairing) => <span key={pairing} className="rounded-full bg-gold/15 px-3 py-2 text-sm font-bold text-gold">{pairing}</span>)}
          </div>
        </div>
      </Section>

      <Section title="記録コメント">
        <div className="grid gap-3">
          <Field label="タグ（カンマ区切り）"><input className={inputClass} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></Field>
          <Field label="記録コメント"><textarea className={`${inputClass} min-h-24`} value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></Field>
        </div>
      </Section>

      <Section title="5. 保存">
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
          <button className="rounded-md bg-moss px-4 py-4 font-black text-rice disabled:opacity-50" onClick={() => void saveLog(false, 'needs_review')} disabled={isSaving || Boolean(savedLogId)}>
            あとで編集
          </button>
          {draftStatus ? <p className="rounded-md bg-rice/8 p-3 text-xs text-rice/70">{draftStatus}</p> : null}
          {status ? <p className="rounded-md bg-gold/15 p-3 text-sm text-gold">{status}</p> : null}
        </div>
      </Section>
    </div>
  );
}

function CropEditor({ draft, quad, onChange }: { draft: ImportedPhotoDraft; quad:PerspectiveQuad; onChange:(value:PerspectiveQuad)=>void }) {
  const move = (corner:keyof PerspectiveQuad, event:React.PointerEvent<HTMLButtonElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const update = (pointer: React.PointerEvent<HTMLButtonElement>) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (pointer.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (pointer.clientY - rect.top) / rect.height));
      onChange({ ...quad, [corner]:{ x, y } });
    };
    update(event);
  };
  const polygon=`${quad.nw.x*100}% ${quad.nw.y*100}%,${quad.ne.x*100}% ${quad.ne.y*100}%,${quad.se.x*100}% ${quad.se.y*100}%,${quad.sw.x*100}% ${quad.sw.y*100}%`;
  return <div className="relative aspect-[4/5] overflow-hidden rounded bg-black/40 touch-none">
    <img src={draft.previewUrl} alt="再解析するラベル範囲" className="h-full w-full object-contain" />
    <div className="pointer-events-none absolute inset-0 border-2 border-gold bg-gold/10" style={{ clipPath:`polygon(${polygon})` }} />
    {(Object.keys(quad) as Array<keyof PerspectiveQuad>).map((corner) => <button key={corner} aria-label={`${corner}の切り抜き位置`} className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-gold shadow" style={{ left:`${quad[corner].x * 100}%`, top:`${quad[corner].y * 100}%` }} onPointerDown={(event) => move(corner,event)} onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId)&&move(corner,event)} />)}
  </div>;
}

function defaultCropQuad():PerspectiveQuad {
  return { nw:{x:0.12,y:0.27}, ne:{x:0.88,y:0.27}, se:{x:0.88,y:0.83}, sw:{x:0.12,y:0.83} };
}

function quadFromRegion(region:{x:number;y:number;width:number;height:number}):PerspectiveQuad {
  return { nw:{x:region.x,y:region.y}, ne:{x:region.x+region.width,y:region.y}, se:{x:region.x+region.width,y:region.y+region.height}, sw:{x:region.x,y:region.y+region.height} };
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

function identificationPhotoTypeLabel(type: IdentificationPhotoType) {
  const labels: Record<IdentificationPhotoType, string> = {
    frontLabel:'表ラベル', backLabel:'裏ラベル', bottle:'ボトル全体', neckLabel:'首ラベル', cap:'キャップ', barcode:'バーコード',
    receipt:'レシート', glass:'グラス', food:'料理', shelf:'棚', multipleBottles:'複数ボトル', other:'その他', unknown:'不明'
  };
  return labels[type];
}
