/**
 * Saved replies (sprint 05 #13): the rules, with no database. Client-safe. The
 * server half is `saved-replies.server.ts`; the composers insert a reply, they
 * never send it, so every send rule applies to the text unchanged.
 */

import { insertAtCaret } from '@/lib/emoji/insert-at-caret';

/** Replies a member may keep. */
export const MAX_SAVED_REPLIES = 50;
export const TITLE_MAX = 60;
/** The direct-message limit (`MESSAGE_MAX_LENGTH`); a composer passes its own `maxLength` where it has one. */
export const BODY_MAX = 2000;
/** The menu shows a filter field once it lists more than this many replies. */
export const FILTER_THRESHOLD = 8;

/** What the API returns and the composers hold. */
export interface SavedReplyRow {
  id: string;
  title: string;
  body: string;
  position: number;
  useCount: number;
  lastUsedAt: string | null;
}

/**
 * The query of a leading `/`: the whole draft is a slash and then a word (letters, digits, `_`, `-`), so
 * `/where` is one and `see /where`, `http://x/where`, `/usr/bin` and a bare `/` are not. `null` when it is not a trigger.
 */
export function slashTrigger(draft: string): string | null {
  const m = /^\/([\p{L}][\p{L}\p{N}_-]*)$/u.exec(draft);
  return m ? (m[1] ?? null) : null;
}

/** Menu order: most recently used first, then most used, then the member's own order. Never mutates. */
export function byRecency<T extends Pick<SavedReplyRow, 'lastUsedAt' | 'useCount' | 'position'>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const at = a.lastUsedAt ? Date.parse(a.lastUsedAt) : -1;
    const bt = b.lastUsedAt ? Date.parse(b.lastUsedAt) : -1;
    if (at !== bt) return bt - at;
    if (a.useCount !== b.useCount) return b.useCount - a.useCount;
    return a.position - b.position;
  });
}

function matchTier(title: string, q: string): number {
  const t = title.toLocaleLowerCase();
  if (t.startsWith(q)) return 0;
  if (t.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1;
  return t.includes(q) ? 2 : -1;
}

/**
 * The replies a query leaves, best first: title starts with it, a word of the title does, the title contains it;
 * within a tier, by recency. An empty query keeps every reply in recency order.
 */
export function rankReplies<T extends SavedReplyRow>(rows: readonly T[], query: string): T[] {
  const ordered = byRecency(rows);
  const q = query.trim().toLocaleLowerCase();
  if (!q) return ordered;
  const tiered: { row: T; tier: number }[] = [];
  for (const row of ordered) {
    const tier = matchTier(row.title, q);
    if (tier >= 0) tiered.push({ row, tier });
  }
  // `sort` is stable, so recency survives inside a tier.
  return tiered.sort((a, b) => a.tier - b.tier).map((x) => x.row);
}

/** `{{name}}` becomes the other person's display name in a direct conversation; with no name (a group) it stays as written. */
export function substituteVariables(body: string, name: string | null | undefined): string {
  const display = name?.trim();
  if (!display) return body;
  return body.replace(/\{\{name\}\}/g, () => display);
}

export interface Insertion {
  value: string;
  /** Where the caret goes: just after the inserted text. */
  caret: number;
}

/**
 * Put `text` at the caret of `value`, replacing the selection `[start, end)` (the emoji picker's insertion, plus the
 * composer's limit). `null` when the result would pass `maxLength`, so a reply is never cut short silently.
 */
export function insertReplyText(
  value: string,
  start: number,
  end: number,
  text: string,
  maxLength: number,
): Insertion | null {
  const { next, caret } = insertAtCaret(value, text, start, end);
  return next.length > maxLength ? null : { value: next, caret };
}

/** The first non-empty line of a body, for the manage list. */
export function firstLine(body: string): string {
  return (
    body
      .split(/\r?\n/)
      .find((l) => l.trim().length > 0)
      ?.trim() ?? ''
  );
}

/** The ids of a comma-separated list: 1 to 50 distinct, non-empty ids of at most 64 characters, or `null`. */
export function parseIdList(raw: string): string[] | null {
  const ids = raw.split(',');
  if (ids.length < 1 || ids.length > MAX_SAVED_REPLIES) return null;
  if (ids.some((id) => id.length < 1 || id.length > 64)) return null;
  return new Set(ids).size === ids.length ? ids : null;
}
