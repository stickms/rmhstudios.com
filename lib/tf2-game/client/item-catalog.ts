/**
 * The item schema in the browser: the loadout builder's catalog
 * (`GET /api/tf2-loadout/catalog`, the same URL the builder loads, so the HTTP cache
 * serves it once), installed for the predicting client and rendering
 * (sim/items/registry.ts `setItemCatalog`) and handed to the listen server.
 * One request per page; `null` when it cannot be loaded (stock items still work).
 */

import type { Catalog } from '../../tf2-loadout/catalog-types';
import { setItemCatalog } from '../sim/items/registry';

const CATALOG_URL = '/api/tf2-loadout/catalog';

let pending: Promise<Catalog | null> | null = null;

export function loadItemCatalog(): Promise<Catalog | null> {
  pending ??= fetch(CATALOG_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Catalog>) : null))
    .then((c) => (c && Array.isArray(c.items) ? c : null))
    .catch(() => null)
    .then((c) => {
      if (c) setItemCatalog(c);
      else pending = null;
      return c;
    });
  return pending;
}
