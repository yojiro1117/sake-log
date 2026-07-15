import { db } from '../db/db';
import type { IdentificationEvidence, IdentificationResult, IdentificationRun } from '../types';

export async function saveIdentificationResult(run: IdentificationRun, result: IdentificationResult) {
  await db.transaction('rw', db.identificationRuns, db.identificationEvidence, async () => {
    await db.identificationRuns.put(run);
    if (result.evidences.length) await db.identificationEvidence.bulkPut(result.evidences);
  });
}

export async function removeIdentificationRun(runId: string) {
  await db.transaction('rw', db.identificationRuns, db.identificationEvidence, async () => {
    await db.identificationRuns.delete(runId);
    await db.identificationEvidence.where('runId').equals(runId).delete();
  });
}

export async function evidenceForRun(runId: string): Promise<IdentificationEvidence[]> {
  return db.identificationEvidence.where('runId').equals(runId).toArray();
}
