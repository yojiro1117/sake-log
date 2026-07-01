import { Camera, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RadarChart } from '../components/RadarChart';
import { Field, Section } from '../components/Section';
import { alcoholOptions, alcoholProfiles } from '../data/alcoholProfiles';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { fileToResizedBlob } from '../services/imageService';
import { historyPriceCandidates, searchRakutenPrices } from '../services/priceService';
import { averageScore, correctedScore, evaluateValue, pairingSuggestions, summarizePrices } from '../services/scoring';
import { generatePostText } from '../services/textGenerator';
import type { AlcoholType, BackgroundMode, MarketPriceCandidate, SakeImage, SakeLog } from '../types';

const inputClass = 'w-full rounded-md border border-rice/12 bg-ink/70 px-3 py-3 text-rice outline-none focus:border-gold';

export function Record() {
  const settings = useLiveQuery(() => db.userSettings.get('default'), undefined);
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const logs = useLiveQuery(() => db.logs.toArray(), []);
  const [alcoholType, setAlcoholType] = useState<AlcoholType>('sake');
  const [productName, setProductName] = useState('');
  const [makerName, setMakerName] = useState('');
  const [region, setRegion] = useState('');
  const [volume, setVolume] = useState<number | undefined>(720);
  const [abv, setAbv] = useState<number | undefined>();
  const [purchasePrice, setPurchasePrice] = useState<number | undefined>();
  const [adoptedMarketPrice, setAdoptedMarketPrice] = useState<number | undefined>();
  const [drankAt, setDrankAt] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [tags, setTags] = useState('');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('original');
  const [photo, setPhoto] = useState<Blob | undefined>();
  const [photoPreview, setPhotoPreview] = useState('');
  const [scores, setScores] = useState<Record<string, number>>(() => initialScores('sake'));
  const [satisfactionScore, setSatisfactionScore] = useState(4);
  const [repeatScore, setRepeatScore] = useState(4);
  const [foodMatchScore, setFoodMatchScore] = useState(4);
  const [foodPairing, setFoodPairing] = useState('');
  const [glassType, setGlassType] = useState('');
  const [mood, setMood] = useState('');
  const [priceImpression, setPriceImpression] = useState('');
  const [priceCandidates, setPriceCandidates] = useState<MarketPriceCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState('');

  const profile = alcoholProfiles[alcoholType];
  const baseAverage = averageScore(scores);
  const correction = correctedScore(baseAverage, satisfactionScore, { food: foodPairing, mood, priceImpression });
  const value = evaluateValue(satisfactionScore, adoptedMarketPrice);
  const pairings = pairingSuggestions(alcoholType, scores);
  const defaultTemplate = templates[0];

  const draftLog = useMemo<SakeLog>(() => {
    const generatedTexts = defaultTemplate
      ? generatePostText(
          { productName, alcoholType, baseScores: scores, satisfactionScore, valueScore: value.valueScore },
          defaultTemplate,
          settings?.toneSettings ?? {
            voice: 'natural',
            ending: 'desu',
            length: 'standard',
            energy: 'standard',
            terminology: 'standard',
            emoji: 'few',
            hashtag: 'standard',
            strictness: 'standard',
            purpose: 'intro'
          }
        )
      : { sns: '', oneLine: '', hashtags: [] };
    return {
      logId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      drankAt,
      alcoholType,
      productName,
      makerName,
      region,
      volume,
      abv,
      purchasePrice,
      adoptedMarketPrice,
      marketPriceSource: priceCandidates.length ? priceCandidates[0].source : adoptedMarketPrice ? 'manual' : undefined,
      marketPriceFetchedAt: priceCandidates[0]?.fetchedAt,
      marketPriceCandidates: priceCandidates,
      ...summarizePrices(priceCandidates),
      valueScore: value.valueScore,
      priceConfidence: value.priceConfidence,
      glassType,
      foodPairing,
      baseScores: scores,
      satisfactionScore,
      repeatScore,
      foodMatchScore,
      correctedScore: correction.score,
      correctionReason: correction.reason,
      generatedTexts,
      memo,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      userConfirmed: true
    };
  }, [
    abv,
    adoptedMarketPrice,
    alcoholType,
    correction.reason,
    correction.score,
    defaultTemplate,
    drankAt,
    foodMatchScore,
    foodPairing,
    glassType,
    makerName,
    memo,
    priceCandidates,
    productName,
    purchasePrice,
    region,
    repeatScore,
    satisfactionScore,
    scores,
    settings?.toneSettings,
    tags,
    value.priceConfidence,
    value.valueScore,
    volume
  ]);

  async function handlePhoto(file?: File) {
    if (!file) return;
    const resized = await fileToResizedBlob(file);
    setPhoto(resized);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(resized));
  }

  async function searchPrice() {
    setIsSearching(true);
    setStatus('');
    try {
      const rakuten = await searchRakutenPrices({ productName, makerName, volume, alcoholType, settings });
      const history = historyPriceCandidates(logs, productName);
      const candidates = [...rakuten, ...history];
      setPriceCandidates(candidates);
      if (candidates[0]) setAdoptedMarketPrice(candidates[0].itemPrice);
      setStatus(candidates.length ? '価格候補を取得しました。正しい候補を選んでください。' : '候補が見つかりませんでした。手入力できます。');
    } catch (error) {
      setStatus(error instanceof Error ? `${error.message} 手入力に切り替えできます。` : '価格取得に失敗しました。');
    } finally {
      setIsSearching(false);
    }
  }

  async function saveLog() {
    if (!productName.trim()) {
      setStatus('銘柄名を入力してください。');
      return;
    }
    const logId = crypto.randomUUID();
    const log = { ...draftLog, logId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (photo) {
      const imageRecord: SakeImage = {
        imageId: crypto.randomUUID(),
        logId,
        imageType: 'frontLabel',
        originalBlob: photo,
        processedBlob: photo,
        backgroundMode,
        createdAt: new Date().toISOString()
      };
      await db.images.put(imageRecord);
    }
    await db.logs.put(log);
    await db.priceCandidates.bulkPut(priceCandidates);
    setStatus('保存しました。ログ画面から確認できます。');
  }

  function switchType(next: AlcoholType) {
    setAlcoholType(next);
    setScores(initialScores(next));
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-bold text-gold">記録フロー</p>
        <h1 className="mt-1 text-2xl font-black">写真と評価で、お酒の記録を作成</h1>
      </header>

      <Section title="1. 酒種選択">
        <div className="grid grid-cols-4 gap-2">
          {alcoholOptions.map((option) => (
            <button
              key={option.type}
              className={`rounded-md px-2 py-3 text-sm font-bold ${alcoholType === option.type ? 'bg-gold text-ink' : 'bg-rice/8 text-rice'}`}
              onClick={() => switchType(option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="2. 写真登録">
        <div className="glass-panel rounded-lg p-4">
          {photoPreview ? <img src={photoPreview} className="mb-3 aspect-[4/3] w-full rounded-md object-cover" alt="登録写真" /> : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-center gap-2 rounded-md bg-rice px-3 py-3 font-bold text-ink">
              <Camera size={18} />
              写真を選択
              <input className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => handlePhoto(event.target.files?.[0])} />
            </label>
            <select className={inputClass} value={backgroundMode} onChange={(event) => setBackgroundMode(event.target.value as BackgroundMode)}>
              <option value="original">そのまま</option>
              <option value="cutout">簡易切り抜き</option>
              <option value="template">背景テンプレート</option>
              <option value="solid">単色背景</option>
              <option value="blur">ぼかし背景</option>
            </select>
          </div>
        </div>
      </Section>

      <Section title="3. 銘柄情報">
        <div className="grid gap-3">
          <Field label="銘柄名"><input className={inputClass} value={productName} onChange={(event) => setProductName(event.target.value)} /></Field>
          <Field label="メーカー・酒造・ワイナリー・ブルワリー"><input className={inputClass} value={makerName} onChange={(event) => setMakerName(event.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="産地"><input className={inputClass} value={region} onChange={(event) => setRegion(event.target.value)} /></Field>
            <Field label="飲酒日"><input className={inputClass} type="date" value={drankAt} onChange={(event) => setDrankAt(event.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="容量ml"><input className={inputClass} type="number" value={volume ?? ''} onChange={(event) => setVolume(Number(event.target.value) || undefined)} /></Field>
            <Field label="度数%"><input className={inputClass} type="number" value={abv ?? ''} onChange={(event) => setAbv(Number(event.target.value) || undefined)} /></Field>
            <Field label="購入価格"><input className={inputClass} type="number" value={purchasePrice ?? ''} onChange={(event) => setPurchasePrice(Number(event.target.value) || undefined)} /></Field>
          </div>
        </div>
      </Section>

      <Section title="4. 市場価格取得">
        <div className="space-y-3">
          <button className="flex w-full items-center justify-center gap-2 rounded-md bg-moss px-4 py-3 font-bold" onClick={searchPrice} disabled={isSearching}>
            <Search size={18} />
            {isSearching ? '検索中' : '楽天市場APIで候補検索'}
          </button>
          <Field label="採用市場価格">
            <input className={inputClass} type="number" value={adoptedMarketPrice ?? ''} onChange={(event) => setAdoptedMarketPrice(Number(event.target.value) || undefined)} />
          </Field>
          {priceCandidates.map((candidate) => (
            <button key={candidate.id} className="w-full rounded-md bg-rice/8 p-3 text-left" onClick={() => setAdoptedMarketPrice(candidate.itemPrice)}>
              <span className="block font-bold">{candidate.itemName}</span>
              <span className="text-sm text-rice/60">{candidate.shopName} / {candidate.itemPrice.toLocaleString()}円 / {candidate.source}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="5. 酒種別評価">
        <div className="grid gap-4">
          {profile.axes.map((axis) => (
            <label key={axis.key} className="rounded-lg bg-rice/7 p-4">
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-bold">{axis.label}</span>
                  <span className="text-xs text-rice/56">{axis.question}</span>
                </span>
                <strong className="text-2xl text-gold">{scores[axis.key]}</strong>
              </span>
              <input
                className="range-thumb mt-4 h-2 w-full appearance-none rounded-full bg-rice/18"
                type="range"
                min="1"
                max="6"
                value={scores[axis.key]}
                onChange={(event) => setScores({ ...scores, [axis.key]: Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section title="6. 補正・満足度">
        <div className="grid gap-3">
          <ScoreInput label="総合満足度" value={satisfactionScore} onChange={setSatisfactionScore} />
          <ScoreInput label="また飲みたい度" value={repeatScore} onChange={setRepeatScore} />
          <ScoreInput label="料理と合わせたい度" value={foodMatchScore} onChange={setFoodMatchScore} />
          <Field label="合わせた料理"><input className={inputClass} value={foodPairing} onChange={(event) => setFoodPairing(event.target.value)} /></Field>
          <Field label="グラス"><input className={inputClass} value={glassType} onChange={(event) => setGlassType(event.target.value)} /></Field>
          <Field label="その日の気分"><input className={inputClass} value={mood} onChange={(event) => setMood(event.target.value)} /></Field>
          <Field label="価格印象"><input className={inputClass} value={priceImpression} onChange={(event) => setPriceImpression(event.target.value)} /></Field>
        </div>
      </Section>

      <Section title="7. レーダーチャート">
        <div className="glass-panel rounded-lg p-4">
          <div className="h-72"><RadarChart type={alcoholType} scores={scores} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="基礎評価" value={baseAverage} />
            <Metric label="補正後" value={correction.score} />
            <Metric label="コスパ" value={value.valueScore} />
          </div>
          <p className="mt-3 text-sm leading-6 text-rice/70">{correction.reason}</p>
        </div>
      </Section>

      <Section title="8. 料理ペアリング">
        <div className="rounded-lg bg-rice/8 p-4">
          <p className="text-sm leading-6 text-rice/70">評価から相性の良さそうな料理を表示します。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pairings.map((pairing) => (
              <span key={pairing} className="rounded-full bg-gold/15 px-3 py-2 text-sm font-bold text-gold">
                {pairing}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="9. 感想メモ">
        <div className="grid gap-3">
          <Field label="タグ（カンマ区切り）"><input className={inputClass} value={tags} onChange={(event) => setTags(event.target.value)} /></Field>
          <Field label="記録コメント"><textarea className={`${inputClass} min-h-24`} value={memo} onChange={(event) => setMemo(event.target.value)} /></Field>
        </div>
      </Section>

      <Section title="10. 保存">
        <div className="grid gap-3">
          <button className="rounded-md bg-rice px-4 py-4 font-black text-ink" onClick={saveLog}>保存</button>
          {status ? <p className="rounded-md bg-gold/15 p-3 text-sm text-gold">{status}</p> : null}
        </div>
      </Section>
    </div>
  );
}

function initialScores(type: AlcoholType) {
  return Object.fromEntries(alcoholProfiles[type].axes.map((axis) => [axis.key, 3]));
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
