import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const resultPath = path.join(root, 'tests/results/ocr-final.json');
const manifestPath = path.join(root, 'tests/fixtures/google-drive-test-manifest.json');
const masterPath = path.join(root, 'src/data/alcoholCandidates.ts');
const raw = await readFile(resultPath, 'utf8');
const source = JSON.parse(raw);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const master = parseMaster(await readFile(masterPath, 'utf8'));

const records = source.results.map((record) => {
  const text = String(record.ocrText ?? '');
  const normalized = normalize(text);
  const candidates = master
    .map((candidate) => {
      const aliases = candidate.aliases.filter((alias) => normalized.includes(normalize(alias)));
      return aliases.length ? { ...candidate, matchedAliases: aliases } : undefined;
    })
    .filter(Boolean);
  const truth = manifest.find((item) => item.fileName === record.fileName);
  const expected = truth?.groundTruthStatus === 'confirmed' ? truth.expectedProductName : undefined;
  const expectedNormalized = expected ? normalize(expected) : undefined;
  return {
    fileName: record.fileName,
    ocrConfidence: record.ocrConfidence ?? 0,
    processingTimeMs: record.processingTimeMs ?? 0,
    textHit: text.trim().length > 0,
    meaningfulText: meaningfulText(text, record.ocrConfidence ?? 0),
    candidates: candidates.map(({ productName, makerName, alcoholType, matchedAliases }) => ({ productName, makerName, alcoholType, matchedAliases })),
    groundTruthStatus: truth?.groundTruthStatus ?? 'unknown',
    correctCandidateIncluded: expectedNormalized ? candidates.some((candidate) => normalize(candidate.productName) === expectedNormalized) : null,
    correctCandidateTop1: expectedNormalized ? normalize(candidates[0]?.productName ?? '') === expectedNormalized : null
  };
});

const known = records.filter((record) => record.groundTruthStatus === 'confirmed');
const output = {
  generatedAt: new Date().toISOString(),
  source: { file: 'tests/results/ocr-final.json', sha256: createHash('sha256').update(raw).digest('hex'), recordCount: records.length },
  definitions: {
    textHit: 'OCR text contains at least one non-whitespace character',
    meaningfulText: 'confidence is at least 0.25 and text contains a plausible word, volume, or ABV token',
    candidateExtraction: 'at least one structured master alias is present in normalized OCR text',
    correctnessDenominator: 'only records whose groundTruthStatus is confirmed'
  },
  metrics: {
    total: records.length,
    textHitRate: rate(records.filter((record) => record.textHit).length, records.length),
    meaningfulTextRate: rate(records.filter((record) => record.meaningfulText).length, records.length),
    candidateExtractionRate: rate(records.filter((record) => record.candidates.length > 0).length, records.length),
    noCandidateRate: rate(records.filter((record) => record.candidates.length === 0).length, records.length),
    groundTruthConfirmed: known.length,
    correctCandidateIncludedRate: known.length ? rate(known.filter((record) => record.correctCandidateIncluded).length, known.length) : null,
    correctCandidateTop1Rate: known.length ? rate(known.filter((record) => record.correctCandidateTop1).length, known.length) : null,
    falseCandidateCount: known.filter((record) => record.candidates.length > 0 && !record.correctCandidateIncluded).length,
    averageProcessingTimeMs: Math.round(records.reduce((sum, record) => sum + record.processingTimeMs, 0) / records.length),
    maxProcessingTimeMs: Math.max(...records.map((record) => record.processingTimeMs))
  },
  records
};

await writeFile(path.join(root, 'tests/results/validation-metrics-recalculated.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output.metrics, null, 2));

function parseMaster(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const productName = line.match(/productName:\s*'([^']+)'/)?.[1];
    const makerName = line.match(/makerName:\s*'([^']+)'/)?.[1];
    const alcoholType = line.match(/alcoholType:\s*'([^']+)'/)?.[1];
    const aliasSource = line.match(/aliases:\s*\[([^\]]+)\]/)?.[1];
    if (!productName || !alcoholType || !aliasSource) return [];
    const aliases = [...aliasSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
    return [{ productName, makerName, alcoholType, aliases }];
  });
}

function normalize(value) {
  return value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function meaningfulText(text, confidence) {
  if (confidence < 0.25) return false;
  return /(?:[A-Za-z]{3,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,}|\d{2,4}\s*(?:ml|%))/u.test(text);
}

function rate(value, total) {
  return total ? Number((value / total).toFixed(3)) : null;
}
