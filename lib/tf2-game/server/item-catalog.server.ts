/**
 * The games hub's copy of the item schema: the loadout builder's catalog, read
 * from the row the web tier keeps current (`tf2_loadout_catalog`, Brotli JSON —
 * lib/tf2-loadout/catalog.server.ts owns building and refreshing it), and handed
 * to the match pool, which passes it to every match worker (sim/items).
 *
 * The hub never fetches the schema itself: it checks the row's hash every
 * `intervalMs` (one tiny query) and only reads and inflates the data when it
 * changed. Without a row (a fresh database) matches run with stock items only and
 * equip commands are refused until the web tier has built one.
 *
 * Takes the Prisma client as an argument so the hub passes its own pool.
 */

import { brotliDecompressSync } from 'node:zlib';
import type { Catalog } from '../../tf2-loadout/catalog-types';

const ROW_ID = 'current';
export const ITEM_CATALOG_CHECK_MS = 10 * 60_000;

/** The slice of the Prisma client this reads. */
export interface CatalogRowReader {
  tf2LoadoutCatalog: {
    findUnique(args: {
      where: { id: string };
      select: { hash: true; data?: true };
    }): Promise<{ hash: string; data?: Uint8Array | Buffer } | null>;
  };
}

export interface ItemCatalogFeedLog {
  info(o: Record<string, unknown>): void;
  warn(o: Record<string, unknown>): void;
}

/** Decodes a stored catalog row's data (Brotli JSON). */
export function decodeCatalogRow(data: Uint8Array | Buffer): Catalog {
  return JSON.parse(brotliDecompressSync(Buffer.from(data)).toString('utf8')) as Catalog;
}

/**
 * Starts watching the stored catalog: `onCatalog` runs with the parsed catalog now (when there is
 * one) and after every change. Returns a stop function.
 */
export function startItemCatalogFeed(
  db: CatalogRowReader,
  onCatalog: (catalog: Catalog) => void,
  log?: ItemCatalogFeedLog,
  intervalMs = ITEM_CATALOG_CHECK_MS,
): () => void {
  let hash = '';
  let stopped = false;
  let busy = false;
  const check = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const head = await db.tf2LoadoutCatalog.findUnique({
        where: { id: ROW_ID },
        select: { hash: true },
      });
      if (!head || head.hash === hash) return;
      const row = await db.tf2LoadoutCatalog.findUnique({
        where: { id: ROW_ID },
        select: { hash: true, data: true },
      });
      if (!row?.data) return;
      const catalog = decodeCatalogRow(row.data);
      hash = row.hash;
      if (!stopped) onCatalog(catalog);
      log?.info({
        event: 'tf2_item_catalog',
        hash: row.hash.slice(0, 12),
        items: catalog.items.length,
      });
    } catch (error) {
      log?.warn({
        event: 'tf2_item_catalog_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), intervalMs);
  (timer as { unref?: () => void }).unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
