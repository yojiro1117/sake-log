import type { AlcoholProductCatalogEntry } from '../types';
import { db } from '../db/db';
import { loadLocalProductCatalog } from './productCatalogService';

export async function loadProductKnowledgeBase(): Promise<AlcoholProductCatalogEntry[]> {
  return loadLocalProductCatalog();
}

export async function registerUserConfirmedProduct(entry: AlcoholProductCatalogEntry) {
  await db.productCatalog.put({ ...entry, source: 'user-confirmed', userConfirmed: true, updatedAt: new Date().toISOString() });
}
