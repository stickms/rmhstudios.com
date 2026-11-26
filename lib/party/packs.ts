/** Games a community pack can target. A pack is one line per entry; `pack-games.ts` says what a line is for each game. */

import type { PackGame } from './pack-games';

export type { CreatePackInput } from './packs-schema';
export const PACK_GAMES = ['wit-war', 'identity-crisis', 'human-keyboard'] as const satisfies readonly PackGame[];
export const PACK_MIN_PROMPTS = 12;
export const PACK_MAX_PROMPTS = 60;
export const PACK_CODE_LEN = 6;
/** Hidden automatically once this many distinct members report it. */
export const PACK_AUTOHIDE_REPORTS = 3;
/**
 * Only a reporter whose account is at least this old (and verified or linked, and not banned) counts toward that
 * auto-hide, so three throwaway accounts cannot hide a pack. Their reports still reach the moderators' queue.
 */
export const PACK_AUTOHIDE_MIN_ACCOUNT_DAYS = 7;
export const MAX_PACKS_PER_MEMBER = 10;
/** No 0/O/1/I so a code read off a screen is unambiguous. */
export const PACK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Case-insensitive de-duplication; returns null when fewer than the minimum remain. */
export function normalizePrompts(prompts: string[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of prompts) {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p.trim());
  }
  return out.length >= PACK_MIN_PROMPTS ? out : null;
}

export interface PackView {
  id: string;
  code: string;
  name: string;
  game: string;
  promptCount: number;
  featured: boolean;
  hidden?: boolean;
  /** A moderator removed the pack (shown to its owner and admins only). */
  moderated?: boolean;
  mine: boolean;
  author: {
    name: string | null;
    handle: string | null;
  } | null;
}
