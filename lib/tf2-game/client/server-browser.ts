/**
 * The server browser's logic (components/tf2-game/ServerBrowser.tsx): one list
 * of dedicated (hub) and peer-to-peer rooms — filtered, searched, sorted by
 * any column — Quick Play's pick, and the favorites / recent servers this
 * device remembers.
 *
 * Ping: a dedicated room's is the round trip to the games hub (every match
 * runs there); a peer-to-peer room's is unknown until connected (the browser
 * never learns a host's address), so it sorts last and shows "—".
 *
 * Pure, except the two storage helpers (localStorage, every access guarded).
 */

import type { Tf2Mode } from '../data/maps';
import type { RoomKind, RoomListEntry } from '../net/events';

export type SortKey = 'name' | 'map' | 'mode' | 'players' | 'ping' | 'host' | 'kind';
export type SortDir = 'asc' | 'desc';

export interface BrowserFilters {
  search: string;
  map: string;
  mode: Tf2Mode | '';
  kind: RoomKind | '';
  /** Hide rooms with no free seat. */
  notFull: boolean;
  /** Only rooms with at least one human. */
  hasHumans: boolean;
  /** Hide rooms with nobody at all (no humans, no bots). */
  hideEmpty: boolean;
}

export const DEFAULT_FILTERS: BrowserFilters = {
  search: '',
  map: '',
  mode: '',
  kind: '',
  notFull: false,
  hasHumans: false,
  hideEmpty: false,
};

/** Seats taken (humans + bots — a human joining replaces a bot, but the browser counts what it sees). */
export const isFull = (r: RoomListEntry): boolean => r.players >= r.maxPlayers;

/** The ping to show for a room, ms, or null ("—"). */
export function roomPing(r: RoomListEntry, hubRttMs: number | null): number | null {
  return r.kind === 'dedicated' && hubRttMs !== null ? Math.round(hubRttMs) : null;
}

export function filterRooms(
  rooms: readonly RoomListEntry[],
  f: BrowserFilters,
  mapTitle: (name: string) => string = (n) => n,
): RoomListEntry[] {
  const q = f.search.trim().toLowerCase();
  return rooms.filter((r) => {
    if (f.map && r.map !== f.map) return false;
    if (f.mode && r.mode !== f.mode) return false;
    if (f.kind && r.kind !== f.kind) return false;
    if (f.notFull && isFull(r)) return false;
    if (f.hasHumans && r.players <= 0) return false;
    if (f.hideEmpty && r.players + r.bots <= 0) return false;
    if (q) {
      const hay = `${r.name} ${r.map} ${mapTitle(r.map)} ${r.mode} ${r.host ?? ''} ${r.code}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortRooms(
  rooms: readonly RoomListEntry[],
  key: SortKey,
  dir: SortDir,
  hubRttMs: number | null,
  mapTitle: (name: string) => string = (n) => n,
): RoomListEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const cmp = (a: RoomListEntry, b: RoomListEntry): number => {
    switch (key) {
      case 'name':
        return text(a.name, b.name);
      case 'map':
        return text(mapTitle(a.map), mapTitle(b.map));
      case 'mode':
        return text(a.mode, b.mode);
      case 'players':
        return a.players - b.players || a.bots - b.bots;
      case 'host':
        return text(a.host ?? '', b.host ?? '');
      case 'kind':
        return text(a.kind, b.kind);
      case 'ping': {
        // Unknown pings sort last whichever way.
        const pa = roomPing(a, hubRttMs);
        const pb = roomPing(b, hubRttMs);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1 * sign;
        if (pb === null) return -1 * sign;
        return pa - pb;
      }
    }
  };
  return [...rooms].sort((a, b) => sign * cmp(a, b) || a.code.localeCompare(b.code));
}

export interface QuickPlayWish {
  mode?: Tf2Mode | '';
  map?: string;
}

/**
 * Quick Play: the best public room that has a seat, for the wished mode / map.
 * Running rooms with the most humans first (a match worth joining), then
 * dedicated over peer-to-peer (the hub's ping is known; a P2P host's upload is
 * the bottleneck), then the lower ping. Null → offer to host or play offline.
 */
export function quickPlayPick(rooms: readonly RoomListEntry[], wish: QuickPlayWish, hubRttMs: number | null): RoomListEntry | null {
  const candidates = rooms.filter(
    (r) => !isFull(r) && (!wish.mode || r.mode === wish.mode) && (!wish.map || r.map === wish.map),
  );
  if (candidates.length === 0) return null;
  const score = (r: RoomListEntry) =>
    (r.state === 'running' ? 1000 : 0) +
    Math.min(r.players, 23) * 20 +
    (r.kind === 'dedicated' ? 10 : 0) -
    Math.min(200, roomPing(r, hubRttMs) ?? 100) / 20;
  return [...candidates].sort((a, b) => score(b) - score(a) || a.code.localeCompare(b.code))[0];
}

// ─── Favorites and recent servers (this device) ─────────────────────────────

export interface SavedServer {
  code: string;
  name: string;
  map: string;
  kind: RoomKind;
  /** Epoch ms when saved / last joined. */
  at: number;
}

export const FAVORITES_KEY = 'rmh:tf2-game:favorites';
export const RECENT_KEY = 'rmh:tf2-game:recent';
const MAX_SAVED = 30;
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Saved servers from storage; anything malformed is dropped. */
export function readSaved(key: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): SavedServer[] {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is SavedServer =>
          !!s &&
          typeof s === 'object' &&
          typeof (s as SavedServer).code === 'string' &&
          CODE_RE.test((s as SavedServer).code) &&
          typeof (s as SavedServer).name === 'string' &&
          typeof (s as SavedServer).map === 'string' &&
          ((s as SavedServer).kind === 'dedicated' || (s as SavedServer).kind === 'p2p') &&
          typeof (s as SavedServer).at === 'number',
      )
      .map((s) => ({ code: s.code, name: s.name.slice(0, 80), map: s.map.slice(0, 64), kind: s.kind, at: s.at }))
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

export function writeSaved(key: string, list: readonly SavedServer[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {
    /* private mode / quota: remembered for this visit only */
  }
}

/** The list with `server` first (replacing an older entry for the same code). */
export function remember(list: readonly SavedServer[], server: SavedServer): SavedServer[] {
  return [server, ...list.filter((s) => s.code !== server.code)].slice(0, MAX_SAVED);
}

export function forget(list: readonly SavedServer[], code: string): SavedServer[] {
  return list.filter((s) => s.code !== code);
}

export function savedFrom(r: RoomListEntry, at = Date.now()): SavedServer {
  return { code: r.code, name: r.name, map: r.map, kind: r.kind, at };
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
