/**
 * "My schools" filters (owner 2026-11-24): the index, the live page and the activity rail can narrow to the schools of
 * the member's current tracker cycle, of all their lists, or of one list. Pure and client-safe.
 *
 * WHICH schools is private (`me/tracker`, `me/lists`), so it is decided in the browser and never reaches a public cache
 * key as a user: the index filters the public school list it already has, and the live feed passes the chosen slugs as
 * the explicit public `schools=` parameter, a sorted list anyone could type.
 */

/** The choice: the newest tracker cycle, every list, or one list. `null` everywhere means "All schools". */
export type MineChoice = { kind: 'cycle' } | { kind: 'lists' } | { kind: 'list'; id: string };

/** A list id as the URL and the device store carry it (a cuid; the same rule as the index's old `list=`). */
const LIST_ID = /^[a-z0-9]{1,40}$/;

/** The URL keys: `mine=cycle`, `list=all`, `list=<id>`. `mine=cycle` wins when a hand-written link has both. */
export function mineOfSearch(search: {
  mine?: 'cycle' | undefined;
  list?: string | undefined;
}): MineChoice | undefined {
  if (search.mine === 'cycle') return { kind: 'cycle' };
  if (search.list === 'all') return { kind: 'lists' };
  if (search.list && LIST_ID.test(search.list)) return { kind: 'list', id: search.list };
  return undefined;
}

/** The URL keys a choice writes; both keys are always named so the other is cleared. */
export function mineToSearch(choice: MineChoice | null): { mine: 'cycle' | undefined; list: string | undefined } {
  if (!choice) return { mine: undefined, list: undefined };
  if (choice.kind === 'cycle') return { mine: 'cycle', list: undefined };
  return { mine: undefined, list: choice.kind === 'lists' ? 'all' : choice.id };
}

/** One string for the select's value and the device store: '' | 'cycle' | 'lists' | 'list:<id>'. */
export function encodeMine(choice: MineChoice | null | undefined): string {
  if (!choice) return '';
  return choice.kind === 'list' ? `list:${choice.id}` : choice.kind;
}

/** The reverse of {@link encodeMine}; anything else (junk, an old shape) is "All schools". Never throws. */
export function decodeMine(v: unknown): MineChoice | null {
  if (v === 'cycle') return { kind: 'cycle' };
  if (v === 'lists') return { kind: 'lists' };
  if (typeof v === 'string' && v.startsWith('list:')) {
    const id = v.slice(5);
    if (LIST_ID.test(id)) return { kind: 'list', id };
  }
  return null;
}

/** The shapes this needs from the private DTOs (structural, so the engine imports no contract). */
export interface MineTracker {
  cycle: { applications: readonly { school: { slug: string } }[] } | null;
}
export interface MineLists {
  lists: readonly { id: string; items: readonly { school: { slug: string } }[] }[];
}

/**
 * The slugs a choice names. `null` means "no filter": no choice, the private answer has not arrived, or the list no
 * longer exists (a stale saved id or an old link: the page shows every school rather than a false empty list). An
 * EMPTY set is a real answer (a cycle or a list with no schools yet) and filters everything out.
 */
export function mineSlugs(
  choice: MineChoice | null | undefined,
  tracker: MineTracker | undefined,
  lists: MineLists | undefined,
): Set<string> | null {
  if (!choice) return null;
  if (choice.kind === 'cycle') {
    if (!tracker) return null;
    return new Set((tracker.cycle?.applications ?? []).map((a) => a.school.slug));
  }
  if (!lists) return null;
  const chosen = choice.kind === 'lists' ? lists.lists : lists.lists.filter((l) => l.id === choice.id);
  if (choice.kind === 'list' && chosen.length === 0) return null;
  return new Set(chosen.flatMap((l) => l.items.map((i) => i.school.slug)));
}

/** Whether a choice still points at something the member has (a deleted list does not). */
export function mineIsKnown(choice: MineChoice | null | undefined, lists: MineLists | undefined): boolean {
  if (!choice) return false;
  if (choice.kind !== 'list') return true;
  return !!lists?.lists.some((l) => l.id === choice.id);
}

/** The most slugs one `schools=` filter carries (there are about 220 active schools; the API's cap too). */
export const MAX_SCHOOLS_FILTER = 300;

/** A school slug as the public readers accept it. */
export const SLUG_RE = /^[a-z0-9-]{1,80}$/;

/**
 * The public `schools=` value for a set of slugs: valid slugs only, deduped, sorted (one set is one cache key, however
 * the member's lists are ordered), at most {@link MAX_SCHOOLS_FILTER}. `undefined` for an empty set: the caller shows
 * the empty state and asks for nothing.
 */
export function schoolsParam(slugs: Iterable<string>): string | undefined {
  const out = [...new Set([...slugs].filter((s) => SLUG_RE.test(s)))].sort().slice(0, MAX_SCHOOLS_FILTER);
  return out.length > 0 ? out.join(',') : undefined;
}

/** The server's reading of `schools=` (already validated): deduped and sorted. */
export const slugsOf = (v: string): string[] => [...new Set(v.split(','))].sort();
