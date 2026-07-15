import { builtInAlcoholProductCatalog, mergeCatalogEntries } from '../data/alcoholProductCatalog';
import { db } from '../db/db';

export async function loadLocalProductCatalog() {
  return mergeCatalogEntries(await db.productCatalog.toArray());
}

export function builtInCatalog() {
  return builtInAlcoholProductCatalog;
}
