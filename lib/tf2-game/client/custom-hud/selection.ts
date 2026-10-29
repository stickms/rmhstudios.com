/**
 * Which HUD the game draws, how that choice is remembered, and how the HUD
 * editor hands a HUD to the game.
 *
 * A selection names a HUD; it never carries one. The files are loaded from
 * where they live (this device's drafts, the account's saved HUDs, a share
 * link) by `source.ts`, and are only ever read as data.
 *
 *   default            the stock TF2 HUD (the game's own)
 *   draft:<id>         a local draft of the HUD editor (IndexedDB)
 *   cloud:<id|slug>    a HUD saved to an account (your own, or a public one)
 *   share:<token>      a HUD opened through its share link
 *
 * The same strings are the `?hud=` handoff from the editor's "Test in game"
 * and the value persisted in localStorage.
 */

export type HudSelection =
  | { kind: 'default' }
  | { kind: 'draft'; id: string }
  | { kind: 'cloud'; id: string }
  | { kind: 'share'; token: string };

export const DEFAULT_SELECTION: HudSelection = { kind: 'default' };

/** The query parameter the editor's "Test in game" opens /tf2/play with. */
export const HUD_PARAM = 'hud';

/** localStorage key holding the active selection. */
export const SELECTION_KEY = 'rmh-tf2-game-hud';

/** Ids, slugs and share tokens: what the API and the draft store hand out (UUIDs, cuids, slugs, base64url). */
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function selectionKey(s: HudSelection): string {
  switch (s.kind) {
    case 'default':
      return 'default';
    case 'draft':
      return `draft:${s.id}`;
    case 'cloud':
      return `cloud:${s.id}`;
    case 'share':
      return `share:${s.token}`;
  }
}

/** Parse a selection string (`?hud=…` or the stored value). Anything malformed is `null`, never a guess. */
export function parseSelection(raw: unknown): HudSelection | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === 'default') return DEFAULT_SELECTION;
  const colon = value.indexOf(':');
  if (colon <= 0) return null;
  const kind = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!ID.test(id)) return null;
  if (kind === 'draft') return { kind: 'draft', id };
  if (kind === 'cloud') return { kind: 'cloud', id };
  if (kind === 'share') return { kind: 'share', token: id };
  return null;
}

/**
 * A HUD link or token pasted by a player: a share link (`…/tf2/hud-editor/s/<token>`), a workshop
 * page (`…/tf2/hud-editor/h/<slug>`), a `?hud=` value, or a bare share token.
 */
export function parseHudLink(raw: string): HudSelection | null {
  const value = raw.trim();
  if (!value) return null;
  const direct = parseSelection(value);
  if (direct) return direct;
  const share = /\/tf2\/hud-editor\/s\/([A-Za-z0-9_-]{1,128})(?:[/?#]|$)/.exec(value);
  if (share) return { kind: 'share', token: share[1] };
  const hud = /\/tf2\/hud-editor\/h\/([A-Za-z0-9_-]{1,128})(?:[/?#]|$)/.exec(value);
  if (hud) return { kind: 'cloud', id: hud[1] };
  const param = /[?&]hud=([^&#]+)/.exec(value);
  if (param) {
    try {
      return parseSelection(decodeURIComponent(param[1]));
    } catch {
      return null;
    }
  }
  return ID.test(value) && value.length >= 16 ? { kind: 'share', token: value } : null;
}

/** Storage the selection persists in (localStorage in the browser; injected in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The remembered selection; the default HUD when nothing (valid) is stored or storage is unavailable. */
export function loadSelection(storage: KeyValueStorage | null = browserStorage()): HudSelection {
  try {
    return parseSelection(storage?.getItem(SELECTION_KEY) ?? null) ?? DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

/** Remember a selection. Returns false when storage refused it (private mode, quota, blocked). */
export function saveSelection(
  s: HudSelection,
  storage: KeyValueStorage | null = browserStorage(),
): boolean {
  try {
    if (!storage) return false;
    if (s.kind === 'default') storage.removeItem(SELECTION_KEY);
    else storage.setItem(SELECTION_KEY, selectionKey(s));
    return true;
  } catch {
    return false;
  }
}

/** The URL the editor's "Test in game" opens. */
export function testInGameUrl(s: HudSelection): string {
  return `/tf2/play?${HUD_PARAM}=${encodeURIComponent(selectionKey(s))}`;
}

/** A local draft was just written (the editor's autosave): the game re-reads it if it is the one in use. */
export { DRAFT_CHANNEL } from '@/lib/tf2-hud/local-drafts';
export interface DraftSavedMessage {
  type: 'draft-saved';
  id: string;
}

export function isDraftSavedMessage(data: unknown): data is DraftSavedMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.type === 'draft-saved' && typeof d.id === 'string' && ID.test(d.id);
}
