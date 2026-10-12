/**
 * Keyword alerts — pure, shared by the fan-out worker and the settings UI.
 * Feature idea A6 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Keyword *mutes* hide what you don't want; keyword *alerts* are the other
 * half — Google Alerts / Reddit's keyword notifications for the feed: "tell
 * me when anyone posts about 'slice it charts' or 'rochester offensive' but
 * not 'leak'". It sits beside saved searches (`lib/search/saved.server.ts`),
 * which are pull; this is push.
 *
 * Matching is deliberately simple and predictable, because a member has to
 * be able to predict what will ping them:
 *   • case- and accent-insensitive ("café" matches "CAFE");
 *   • whole words / whole phrases only ("art" does not match "start");
 *   • a phrase is its words in order with any whitespace or punctuation
 *     between them ("slice it" matches "Slice-it" and "slice  it");
 *   • `-word` excludes: a post containing any excluded word never matches;
 *   • `#tag` matches the tag form only.
 * There is no regex syntax for members — regexes are a ReDoS surface on a
 * path that runs for every post.
 */

export const MAX_ALERTS = 10;
export const MAX_ALERT_LENGTH = 80;

export interface CompiledAlert {
  source: string;
  include: RegExp[];
  exclude: RegExp[];
}

/** Lower-case and strip combining accents. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wordPattern(term: string): RegExp | null {
  const isTag = term.startsWith('#');
  const words = fold(isTag ? term.slice(1) : term).match(/[\p{L}\p{N}]+/gu);
  if (!words || words.length === 0) return null;
  const body = words.map(escape).join('[^\\p{L}\\p{N}]+');
  return isTag
    ? new RegExp(`(?<![\\p{L}\\p{N}_])#${body}(?![\\p{L}\\p{N}_])`, 'u')
    : new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
}

/**
 * Compile one alert string. Quoted spans are phrases; bare words are each
 * required (AND); `-word` / `-"phrase"` exclude. Returns null if nothing
 * positive remains.
 */
export function compileAlert(source: string): CompiledAlert | null {
  const trimmed = source.trim().slice(0, MAX_ALERT_LENGTH);
  const include: RegExp[] = [];
  const exclude: RegExp[] = [];
  for (const m of trimmed.matchAll(/(-?)(?:"([^"]+)"|(\S+))/g)) {
    const re = wordPattern(m[2] ?? m[3] ?? '');
    if (!re) continue;
    (m[1] ? exclude : include).push(re);
  }
  return include.length ? { source: trimmed, include, exclude } : null;
}

export function matches(alert: CompiledAlert, text: string): boolean {
  const t = fold(text);
  return alert.include.every((re) => re.test(t)) && !alert.exclude.some((re) => re.test(t));
}

/** Which of a member's alerts a post trips (for the notification copy). */
export function trippedAlerts(alerts: readonly CompiledAlert[], text: string): string[] {
  return alerts.filter((a) => matches(a, text)).map((a) => a.source);
}
