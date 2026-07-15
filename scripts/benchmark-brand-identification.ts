import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { identifyAlcoholProductAtCycle } from '../src/services/brandIdentification';
import { normalizeCatalogTerm } from '../src/services/ocrNormalization';
import type { CandidateMatch } from '../src/types';

type Split = 'tuning' | 'validation' | 'holdout';
type GroundTruth = {
  driveFileId:string; fileName:string; groupId:string; split:Split; groundTruthStatus:'confirmed'|'partiallyConfirmed'|'unknown';
  expectedBrandFamily?:string; expectedProductName?:string; expectedVariant?:string; expectedMakerName?:string;
  expectedAlcoholType?:string; expectedVolumeMl?:number; expectedAbv?:number; visibleText?:string;
};
type OcrRecord = { driveFileId:string; fileName:string; ocrText:string; ocrConfidence:number; processingTimeMs:number; status:string };
type BenchmarkRecord = {
  fileName:string; groupId:string; split:Split; groundTruthStatus:GroundTruth['groundTruthStatus']; expectedBrandFamily?:string; expectedProductName?:string;
  topCandidates:Array<{ confidence?:number; [key:string]:unknown }>;
  correctTop1:boolean; correctTop3:boolean; correctTop5:boolean; brandTop1:boolean; makerTop1:boolean; alcoholTypeTop1:boolean;
  volumeTop1?:boolean; abvTop1?:boolean; ocrText:string; ocrConfidence:number; processingTimeMs:number; identificationTimeMs:number; abstained:boolean;
};

const root = process.cwd();
const truth = JSON.parse(await readFile(path.join(root, 'tests/fixtures/product-identification-ground-truth.json'), 'utf8')) as GroundTruth[];
const ocrJson = JSON.parse(await readFile(path.join(root, 'tests/results/ocr-final.json'), 'utf8')) as { results:OcrRecord[] };
const ocr = new Map(ocrJson.results.map((item) => [item.driveFileId ?? item.fileName, item]));
const resultDir = path.join(root, 'tests/results');
await mkdir(resultDir, { recursive:true });

function same(left?:string, right?:string) { return Boolean(left && right && normalizeCatalogTerm(left) === normalizeCatalogTerm(right)); }
function contains(left?:string, right?:string) { const a=normalizeCatalogTerm(left ?? ''); const b=normalizeCatalogTerm(right ?? ''); return Boolean(a && b && (a.includes(b) || b.includes(a))); }
function candidateMatches(item:CandidateMatch | undefined, expected?:string) { return Boolean(item && same(item.productName, expected)); }
function brandMatches(item:CandidateMatch | undefined, expected?:string) { return Boolean(item && (same(item.brandFamily, expected) || contains(item.productName, expected))); }

const cycles = [1,2,3,4,5,6] as const;
for (const cycle of cycles) {
  const groupCandidates = new Map<string, CandidateMatch[]>();
  if (cycle >= 4) for (const groupId of new Set(truth.map((item) => item.groupId))) {
    const group = truth.filter((item) => item.groupId === groupId);
    const text = group.map((item) => ocr.get(item.driveFileId)?.ocrText ?? '').join('\n---\n');
    const repeatedTerms = [...new Set(text.split(/\s+/).map(normalizeCatalogTerm).filter((term) => term.length >= 2 && text.split(term).length > 2))];
    const combined = identifyAlcoholProductAtCycle({ text, ocrConfidence:average(group.map((item) => ocr.get(item.driveFileId)?.ocrConfidence ?? 0)), imageCount:group.length, repeatedTerms }, cycle);
    const individual = group.flatMap((item) => identifyAlcoholProductAtCycle({ text:ocr.get(item.driveFileId)?.ocrText ?? '', ocrConfidence:ocr.get(item.driveFileId)?.ocrConfidence ?? 0 }, cycle));
    const merged = new Map<string,CandidateMatch>();
    for (const candidate of [...combined,...individual]) {
      const key = candidate.productId ?? candidate.productName ?? '';
      const previous = merged.get(key);
      if (!previous || (candidate.totalConfidence ?? 0) > (previous.totalConfidence ?? 0)) merged.set(key,candidate);
    }
    groupCandidates.set(groupId,[...merged.values()].sort((a,b)=>(b.totalConfidence ?? 0)-(a.totalConfidence ?? 0)).slice(0,5));
  }
  const records: BenchmarkRecord[] = truth.map((item) => {
    const raw = ocr.get(item.driveFileId);
    const started = performance.now();
    const candidates = cycle >= 4 ? groupCandidates.get(item.groupId) ?? [] : identifyAlcoholProductAtCycle({ text:raw?.ocrText ?? '', ocrConfidence:raw?.ocrConfidence ?? 0 }, cycle);
    const identificationTimeMs = performance.now() - started;
    return {
      fileName:item.fileName, groupId:item.groupId, split:item.split, groundTruthStatus:item.groundTruthStatus,
      expectedBrandFamily:item.expectedBrandFamily, expectedProductName:item.expectedProductName,
      topCandidates:candidates.map((candidate) => ({ productId:candidate.productId, brandFamily:candidate.brandFamily, productName:candidate.productName, makerName:candidate.makerName, alcoholType:candidate.alcoholType, confidence:candidate.calibratedConfidence ?? candidate.totalConfidence, reasons:candidate.matchReasons, mismatchReasons:candidate.mismatchReasons })),
      correctTop1:candidateMatches(candidates[0], item.expectedProductName),
      correctTop3:candidates.slice(0,3).some((candidate) => candidateMatches(candidate,item.expectedProductName)),
      correctTop5:candidates.some((candidate) => candidateMatches(candidate,item.expectedProductName)),
      brandTop1:brandMatches(candidates[0],item.expectedBrandFamily),
      makerTop1:same(candidates[0]?.makerName,item.expectedMakerName),
      alcoholTypeTop1:candidates[0]?.alcoholType === item.expectedAlcoholType,
      volumeTop1:item.expectedVolumeMl === undefined ? undefined : candidates[0]?.volume === item.expectedVolumeMl,
      abvTop1:item.expectedAbv === undefined ? undefined : candidates[0]?.abv === item.expectedAbv,
      ocrText:raw?.ocrText ?? '', ocrConfidence:raw?.ocrConfidence ?? 0,
      processingTimeMs:raw?.processingTimeMs ?? 0, identificationTimeMs,
      abstained:candidates.length === 0
    };
  });
  const metricsBySplit = Object.fromEntries((['tuning','validation'] as Split[]).map((split) => [split, metrics(records.filter((item) => item.split === split))]));
  const payload = {
    cycle,
    evaluatedAt:new Date().toISOString(),
    algorithmChange:[
      'NFKC normalization and exact alias matching establish the baseline.',
      'OCR confusion correction plus n-gram and Levenshtein retrieval improve recall.',
      'Maker, volume, ABV, alcohol type, and exclusion evidence rerank candidates.',
      'Multiple photos in the same product group fuse front, back, and bottle evidence.',
      'Confirmed visual similarity and wider local-catalog retrieval add non-text evidence.',
      'Validation-calibrated confidence, evidence diversity, and margin enforce abstention.'
    ][cycle - 1],
    metricsBySplit,
    holdoutSealed:true,
    records:records.filter((item) => item.split !== 'holdout')
  };
  await writeFile(path.join(resultDir, `brand-cycle-${cycle}.json`), `${JSON.stringify(payload,null,2)}\n`);
  if (cycle === 1) await writeFile(path.join(resultDir, 'brand-baseline.json'), `${JSON.stringify(payload,null,2)}\n`);
  if (cycle === 6) {
    const holdoutRecords = records.filter((item) => item.split === 'holdout');
    await writeFile(path.join(resultDir, 'brand-holdout-final.json'), `${JSON.stringify({ evaluatedAt:new Date().toISOString(), cycle:6, metrics:metrics(holdoutRecords), records:holdoutRecords },null,2)}\n`);
    await writeFile(path.join(resultDir, 'identification-holdout-final.json'), `${JSON.stringify({ evaluatedAt:new Date().toISOString(), cycle:6, metrics:metrics(holdoutRecords), records:holdoutRecords },null,2)}\n`);
  }
  await writeFile(path.join(resultDir, `identification-cycle-${cycle}.json`), `${JSON.stringify(payload,null,2)}\n`);
  console.log(`cycle ${cycle}`, JSON.stringify(metricsBySplit));
}

function metrics(records: BenchmarkRecord[]) {
  const known = records.filter((item) => item.groundTruthStatus !== 'unknown' && item.expectedBrandFamily);
  const exact = records.filter((item) => item.groundTruthStatus === 'confirmed' && item.expectedProductName);
  const unknown = records.filter((item) => item.groundTruthStatus === 'unknown');
  const field = (key:'volumeTop1'|'abvTop1') => records.filter((item) => item[key] !== undefined);
  const rate = <T,>(items:T[], predicate:(item:T)=>boolean) => items.length ? Number((items.filter(predicate).length / items.length).toFixed(4)) : null;
  const times = records.map((item) => item.processingTimeMs).sort((a,b) => a-b);
  return {
    images:records.length, knownImages:known.length, exactProductDenominator:exact.length,
    candidateDisplayRate:rate(known,(item)=>!item.abstained), top1Accuracy:rate(exact,(item)=>item.correctTop1),
    top3Recall:rate(exact,(item)=>item.correctTop3), top5Recall:rate(exact,(item)=>item.correctTop5),
    brandFamilyAccuracy:rate(known,(item)=>item.brandTop1), makerAccuracy:rate(known,(item)=>item.makerTop1),
    alcoholTypeAccuracy:rate(known,(item)=>item.alcoholTypeTop1), volumeAccuracy:rate(field('volumeTop1'),(item)=>item.volumeTop1), abvAccuracy:rate(field('abvTop1'),(item)=>item.abvTop1),
    falsePositiveRate:rate(known,(item)=>!item.abstained && !item.brandTop1), unknownCandidateRate:rate(unknown,(item)=>!item.abstained),
    abstentionRate:rate(records,(item)=>item.abstained), missedCandidateRate:rate(known,(item)=>item.abstained),
    highConfidenceWrong:records.filter((item)=>!item.brandTop1 && (item.topCandidates[0]?.confidence ?? 0)>=86).length,
    p50ProcessingTimeMs:percentile(times,.5), p95ProcessingTimeMs:percentile(times,.95), averageIdentificationTimeMs:Number(average(records.map((item)=>item.identificationTimeMs)).toFixed(3))
  };
}
function average(values:number[]) { return values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length); }
function percentile(values:number[], point:number) { return values.length ? values[Math.min(values.length-1,Math.floor((values.length-1)*point))] : null; }
