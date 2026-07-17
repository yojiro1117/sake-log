import { BUILD_INFO } from '../config/buildInfo';
import { db } from '../db/db';
import { getVisionEnvironment } from '../platform/visionAdapter';

export interface SafeDiagnostics {
  generatedAt: string;
  app: Record<string, unknown>;
  runtime: Record<string, unknown>;
  storage: Record<string, unknown>;
  indexedDb: Record<string, unknown>;
  serviceWorker: Record<string, unknown>;
  cacheNames: string[];
  lastPhotoImport: Record<string, unknown> | null;
  visualRetrieval: Record<string, unknown>;
}

export async function createSafeDiagnostics(): Promise<SafeDiagnostics> {
  const vision = await getVisionEnvironment().catch(() => undefined);
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  const cacheNames = 'caches' in globalThis ? await caches.keys().catch(() => []) : [];
  const tableCounts = Object.fromEntries(await Promise.all(db.tables.map(async (table) => [table.name, await table.count().catch(() => -1)])));
  const lastPhotoImport = await db.externalSources.get('diagnostic:last-photo-import');
  const [latestRun, references] = await Promise.all([
    db.identificationRuns.orderBy('createdAt').reverse().first(),
    db.referenceImages.toArray()
  ]);
  const referencesByModel = Object.fromEntries([...new Set(references.map((reference) => `${reference.embeddingModel ?? reference.fingerprint.embeddingModel ?? 'legacy'}@${reference.embeddingVersion ?? reference.fingerprint.embeddingVersion ?? 'legacy'}`))]
    .map((model) => [model, references.filter((reference) => `${reference.embeddingModel ?? reference.fingerprint.embeddingModel ?? 'legacy'}@${reference.embeddingVersion ?? reference.fingerprint.embeddingVersion ?? 'legacy'}` === model).length]));
  return {
    generatedAt: new Date().toISOString(),
    app: { version: BUILD_INFO.version, commit: BUILD_INFO.commit, buildTime: BUILD_INFO.buildTime },
    runtime: {
      online: navigator.onLine,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
      textDetectorAvailable: 'TextDetector' in globalThis,
      heicFallbackAvailable: true,
      ocrLanguages: ['jpn', 'eng']
      , visionEnvironment: vision?.environment ?? 'pwa'
      , ocrEngine: vision?.ocrEngine ?? 'tesseract'
      , barcodeEngine: vision?.barcodeEngine ?? 'BarcodeDetector / ZXing'
      , visualEngine: vision?.visualEngine ?? 'sake-local-fingerprint-v1'
      , modelVersion: vision?.modelVersion ?? 'web-v1'
      , catalogVersion: vision?.catalogVersion ?? 'catalog-core-v1'
      , thermalState: vision?.thermalState ?? null
      , batteryLevel: vision?.batteryLevel ?? null
    },
    storage: { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null },
    indexedDb: { name: db.name, version: db.verno, tableCounts },
    serviceWorker: {
      supported: 'serviceWorker' in navigator,
      active: Boolean(registration?.active),
      waiting: Boolean(registration?.waiting),
      installing: Boolean(registration?.installing)
    },
    cacheNames,
    lastPhotoImport: (lastPhotoImport?.payload as Record<string, unknown> | undefined) ?? null,
    visualRetrieval: {
      referenceCount: references.length,
      referencesByModel,
      latestRun: latestRun ? {
        id: latestRun.id,
        imageCount: latestRun.imageIds.length,
        candidateProductIds: latestRun.candidateProductIds.slice(0, 5),
        abstained: latestRun.abstained,
        processingTimeMs: latestRun.processingTimeMs,
        warnings: latestRun.warnings ?? [],
        errors: latestRun.errors ?? []
      } : null
    }
  };
}

export async function clearApplicationCaches() {
  if (!('caches' in globalThis)) return 0;
  const names = await caches.keys();
  const deleted = await Promise.all(names.map((name) => caches.delete(name)));
  return deleted.filter(Boolean).length;
}

export async function checkServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  await registration.update();
  return Boolean(registration.waiting);
}
