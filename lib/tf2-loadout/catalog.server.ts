/**
 * The loadout catalog's source of truth and its auto-refresh.
 *
 * The item schema comes from the public GameTracking-TF2 mirror of the game's
 * files (`items_game.txt` + `tf_english.txt`), or — when `STEAM_API_KEY` is set —
 * from Valve's own schema URL (`IEconItems_440/GetSchemaURL`), which is current
 * the moment Valve ships. With the key, `GetSchemaItems` also supplies the
 * inventory icons the mirror cannot (they live in the game's packed files).
 *
 * Nobody has to push a change when the game updates: reads serve the stored
 * snapshot immediately and, when it has not been checked for `STALE_AFTER_MS`,
 * refresh it in the background. The mirror is queried with `If-None-Match`, so
 * an unchanged schema costs a 304, not 8 MB. A failed refresh keeps serving the
 * last good snapshot.
 */

import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { prisma } from '@/lib/prisma.server';
import { safeFetch } from '@/lib/ssrf-guard.server';
import { applyIcons, BUILDER_VERSION, buildCatalog, schemaHash } from './catalog-build';
import type { Catalog } from './catalog-types';

const ROW_ID = 'current';
const MIRROR = 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-TF2/master/tf/';
const MIRROR_LABEL = 'SteamDatabase/GameTracking-TF2';
const STEAM_API = 'https://api.steampowered.com/IEconItems_440/';
const STEAM_HOSTS = ['api.steampowered.com', 'media.steampowered.com', 'steamcdn-a.akamaihd.net'];
/** How long a successful check is trusted before a read triggers another. */
const STALE_AFTER_MS = 6 * 60 * 60_000;
/** After a failed refresh, don't retry for this long (reads must not hammer the mirror). */
const RETRY_AFTER_MS = 15 * 60_000;
const FETCH_TIMEOUT_MS = 90_000;
const ICON_MARKER = '/apps/440/icons/';

export interface ServedCatalog {
  hash: string;
  /** The catalog as JSON text, ready to send. */
  json: string;
  checkedAt: Date;
  /** Built by the current builder version (an older one is rebuilt straight away). */
  builderCurrent: boolean;
}

let memo: ServedCatalog | null = null;
let parsed: { hash: string; catalog: Catalog } | null = null;
let inflight: Promise<void> | null = null;
let lastFailureAt = 0;

const steamKey = (): string | undefined => process.env.STEAM_API_KEY || undefined;

async function fetchText(
  url: string,
  hosts: string[],
  headers: Record<string, string> = {},
): Promise<Response> {
  return safeFetch(url, { headers, allowedHosts: hosts, timeoutMs: FETCH_TIMEOUT_MS });
}

/** Valve's current schema file URL, via the Web API. Null when there's no key or the call fails. */
async function steamSchemaUrl(key: string): Promise<string | null> {
  try {
    const res = await fetchText(`${STEAM_API}GetSchemaURL/v1/?key=${encodeURIComponent(key)}`, [
      'api.steampowered.com',
    ]);
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { items_game_url?: string } };
    const url = body.result?.items_game_url;
    return url && /^https:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** defindex → icon path from `GetSchemaItems` (paged). Empty on any failure. */
async function steamIcons(key: string): Promise<Map<number, string>> {
  const icons = new Map<number, string>();
  try {
    let start: number | undefined = 0;
    for (let page = 0; start !== undefined && page < 40; page++) {
      const res = await fetchText(
        `${STEAM_API}GetSchemaItems/v1/?key=${encodeURIComponent(key)}&language=en&start=${start}`,
        ['api.steampowered.com'],
      );
      if (!res.ok) break;
      const body = (await res.json()) as {
        result?: {
          items?: { defindex: number; image_url?: string; image_url_large?: string }[];
          next?: number;
        };
      };
      for (const it of body.result?.items ?? []) {
        const url = it.image_url_large || it.image_url;
        if (!url) continue;
        const at = url.indexOf(ICON_MARKER);
        icons.set(it.defindex, at >= 0 ? url.slice(at + ICON_MARKER.length) : url);
      }
      start = body.result?.next;
    }
  } catch {
    /* icons are an enhancement; a failure leaves the catalog without them */
  }
  return icons;
}

function pack(catalog: Catalog): Buffer {
  return brotliCompressSync(Buffer.from(JSON.stringify(catalog)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
  });
}

/**
 * Check the schema source and rebuild the stored catalog if it changed (or if
 * `force`). Resolves once the stored row is current; throws if there is no
 * usable source and nothing stored.
 */
async function refresh(force: boolean): Promise<void> {
  const row = await prisma.tf2LoadoutCatalog.findUnique({ where: { id: ROW_ID } });
  const key = steamKey();
  const now = new Date();

  // Prefer Valve's schema when we can reach it; otherwise the mirror.
  const steamUrl = key ? await steamSchemaUrl(key) : null;
  const sourceUrl = steamUrl ?? `${MIRROR}scripts/items/items_game.txt`;
  const sourceHosts = steamUrl ? STEAM_HOSTS : ['raw.githubusercontent.com'];
  const label = steamUrl ? 'Steam Web API' : MIRROR_LABEL;

  // The stored ETag is prefixed with the builder version, so a catalog built by an
  // older builder is never answered with "not modified".
  const storedEtag = row?.etag?.startsWith(`${BUILDER_VERSION}|`)
    ? row.etag.slice(`${BUILDER_VERSION}|`.length)
    : null;
  const conditional =
    !force && storedEtag && row?.label === label ? { 'If-None-Match': storedEtag } : undefined;
  const res = await fetchText(sourceUrl, sourceHosts, conditional);

  if (res.status === 304 && row) {
    await prisma.tf2LoadoutCatalog.update({ where: { id: ROW_ID }, data: { checkedAt: now } });
    memo = null;
    return;
  }
  if (!res.ok) throw new Error(`Schema fetch failed (${res.status})`);
  const itemsGame = await res.text();
  const etag = res.headers.get('etag');

  // Same bytes as last time: nothing to rebuild unless icons are newly possible.
  const probe = schemaHash(itemsGame);
  if (!force && row && row.hash === probe && (row.hasIcons || !key)) {
    await prisma.tf2LoadoutCatalog.update({
      where: { id: ROW_ID },
      data: { checkedAt: now, ...(etag ? { etag: `${BUILDER_VERSION}|${etag}` } : {}) },
    });
    memo = null;
    return;
  }

  const englishRes = await fetchText(`${MIRROR}resource/tf_english.txt`, [
    'raw.githubusercontent.com',
  ]);
  if (!englishRes.ok) throw new Error(`Localisation fetch failed (${englishRes.status})`);

  // War paint names live in another localisation file; the catalog is useful without them, so a failed
  // fetch only means no war paints this time.
  const protoRes = await fetchText(`${MIRROR}resource/tf_proto_obj_defs_english.txt`, [
    'raw.githubusercontent.com',
  ]).catch(() => null);
  const protoEnglish = protoRes?.ok ? await protoRes.text() : undefined;

  let catalog = buildCatalog({ itemsGame, english: await englishRes.text(), protoEnglish, label });
  if (key) catalog = applyIcons(catalog, await steamIcons(key));
  if (catalog.items.length < 500)
    throw new Error('Built catalog is implausibly small; keeping the old one');

  const data = pack(catalog);
  const fields = {
    hash: catalog.source.hash,
    etag: etag ? `${BUILDER_VERSION}|${etag}` : null,
    label,
    itemCount: catalog.items.length,
    hasIcons: catalog.source.hasIcons,
    data: new Uint8Array(data),
    builtAt: new Date(catalog.source.builtAt),
    checkedAt: now,
  };
  await prisma.tf2LoadoutCatalog.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, ...fields },
    update: fields,
  });
  memo = {
    hash: catalog.source.hash,
    json: JSON.stringify(catalog),
    checkedAt: now,
    builderCurrent: true,
  };
}

/** Run one refresh at a time; concurrent callers share it. */
export function refreshCatalog(force = false): Promise<void> {
  inflight ??= refresh(force)
    .then(() => {
      lastFailureAt = 0;
    })
    .catch((e) => {
      lastFailureAt = Date.now();
      throw e;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function load(): Promise<ServedCatalog | null> {
  if (memo) return memo;
  const row = await prisma.tf2LoadoutCatalog.findUnique({ where: { id: ROW_ID } });
  if (!row) return null;
  const json = brotliDecompressSync(Buffer.from(row.data)).toString('utf8');
  memo = {
    hash: row.hash,
    json,
    checkedAt: row.checkedAt,
    builderCurrent: row.etag?.startsWith(`${BUILDER_VERSION}|`) ?? false,
  };
  return memo;
}

/**
 * The current catalog. First load and schema upgrades wait for a refresh;
 * ordinary stale snapshots are served at once and refreshed in the background.
 */
export async function getCatalog(): Promise<ServedCatalog | null> {
  let served = await load();
  if (!served) {
    await refreshCatalog(true);
    served = await load();
    return served;
  }
  // Upgrade the shape before clients sanitize saved drafts. A legacy snapshot
  // without effect families must not erase valid saved unusuals after a deploy.
  if (!served.builderCurrent && Date.now() - lastFailureAt > RETRY_AFTER_MS) {
    try {
      await refreshCatalog(true);
      return await load();
    } catch (error) {
      console.warn('[tf2-loadout] catalog upgrade failed; keeping the previous snapshot:', error);
      return served;
    }
  }
  const age = Date.now() - served.checkedAt.getTime();
  // A snapshot built by an older builder is stale however recently it was checked: after a deploy that
  // changes what the catalog holds, the new shape is rebuilt at once instead of hours later.
  if (
    (age > STALE_AFTER_MS || !served.builderCurrent) &&
    !inflight &&
    Date.now() - lastFailureAt > RETRY_AFTER_MS
  ) {
    void refreshCatalog(!served.builderCurrent).catch((e) =>
      console.warn('[tf2-loadout] catalog refresh failed; serving the previous snapshot:', e),
    );
  }
  return served;
}

/** The parsed catalog, for server-side validation of a saved loadout. */
export async function getCatalogObject(): Promise<Catalog | null> {
  const served = await getCatalog();
  if (!served || !served.builderCurrent) return null;
  if (parsed?.hash !== served.hash) {
    parsed = { hash: served.hash, catalog: JSON.parse(served.json) as Catalog };
  }
  return parsed.catalog;
}
