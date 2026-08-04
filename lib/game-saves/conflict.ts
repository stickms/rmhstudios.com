/**
 * Two saves, one player, and the question of which one survives.
 *
 * Every game on this site can now be played signed out — the save lives in
 * `localStorage` — and signed in, where it also lives on the account. So a save
 * can exist in two places at once, and the two can disagree. The naive fixes are
 * both wrong in a way that costs somebody a run:
 *
 * - **"Newest wins"** loses a night of play the moment you open the game on a
 *   second device: the fresh device writes an empty save at t+0, which is newer
 *   than everything, and the old save is gone before you have read the screen.
 * - **"Always ask"** asks on *every load*, because on a single device the local
 *   copy is almost always a few seconds newer than the last server write — the
 *   server write is throttled and the beacon on teardown is best-effort.
 *
 * The distinction that actually matters is not *newer*, it is **diverged**. A
 * save is a continuation of another one when every counter that can only ever go
 * up has, in fact, only gone up: lifetime score, playtime, runs finished. If one
 * save dominates the other on all of them, it is simply the same run further
 * along and it wins silently. If each is ahead on something, they are two
 * different histories — the player played somewhere else — and *that* is the
 * only case worth interrupting for.
 *
 * The consequence worth stating: this module never destroys anything on its own.
 * A divergence returns `conflict` and the caller shows the player both, with
 * enough figures to tell them apart. What they choose overwrites the other; what
 * they did not choose is what they knowingly gave up.
 */

/** One figure in a save's summary card — "Joy, all time", "1.24 Qa". */
export interface SaveSummaryLine {
  label: string;
  value: string;
}

/**
 * A save reduced to what a person needs in order to choose between two of them.
 *
 * Built by the game, because only the game knows which of its numbers means
 * "how much of my life is in here". Keep `lines` to four or fewer: the two cards
 * sit side by side on a phone, and a card you have to scroll is a card you
 * cannot compare.
 */
export interface SaveSummary {
  /** When this save was written, ms since epoch. `0` when unknown. */
  savedAt: number;
  /** The one figure that says how far along this save is. */
  headline: string;
  /** Supporting figures, in the order they should be read. */
  lines: SaveSummaryLine[];
}

export type SaveOrigin = 'local' | 'cloud';

/**
 * Just enough of i18next's `t` to label a summary.
 *
 * A summary is built in `lib/`, where there is no React and no provider, but its
 * labels are read by a person and have to translate. So the builder takes a
 * translator instead of importing one: the component that has a real `t` passes
 * it in, and anything calling from outside React passes {@link untranslated} and
 * gets the English defaults — which is the correct fallback, since English is
 * authoritative here anyway.
 */
export type SummaryTranslate = (
  key: string,
  options: { defaultValue: string } & Record<string, unknown>,
) => string;

/**
 * The fallback translator: English defaults, with `{{placeholders}}` filled the
 * way i18next would fill them. Interpolating here rather than returning the raw
 * template matters — a summary card reading "{{joy}} joy, all time" is worse
 * than no card at all.
 */
export const untranslated: SummaryTranslate = (_key, options) =>
  options.defaultValue.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in options ? String(options[name]) : match,
  );

/**
 * What to do with the pair.
 *
 * `resolved` covers "there is only one" and "one is a continuation of the other"
 * alike, because the caller does the same thing with both: load it and carry on.
 * Only `conflict` needs a person.
 */
export type SaveChoice<T> =
  | { kind: 'none' }
  | { kind: 'resolved'; origin: SaveOrigin; save: T }
  | { kind: 'conflict'; local: T; cloud: T };

/** The counters a save can never run backwards on, by name. */
export type MonotonicCounters = Record<string, number>;

/**
 * Does `a` contain everything `b` does?
 *
 * Read over the UNION of both key sets, not over `a`'s: a save written by an
 * older build is missing the counters that build did not have, and treating a
 * missing key as "no constraint" would let an old save dominate a newer one that
 * is ahead on exactly the field the old one cannot report. A missing counter is
 * zero, which is the truth — that build had not counted it yet.
 *
 * Non-finite values (a hand-edited save, a `NaN` from a division that should
 * never have happened) are read as zero rather than poisoning the comparison:
 * `NaN >= 0` is `false`, so one corrupt field would otherwise make a save fail
 * to dominate *itself*, and every load would become a conflict prompt.
 */
export function dominates(a: MonotonicCounters, b: MonotonicCounters): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (finite(a[key]) < finite(b[key])) return false;
  }
  return true;
}

function finite(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface ChooseSaveInput<T> {
  local: T | null;
  cloud: T | null;
  /** The counters that only ever go up, read off a save. */
  monotonic: (save: T) => MonotonicCounters;
  /** When a save was written. Only consulted to break an exact tie. */
  savedAt: (save: T) => number;
}

/**
 * Decide between the copy on this device and the copy on the account.
 *
 * The tie case is worth spelling out: when neither save is ahead of the other on
 * any counter they are the *same* save seen twice — the ordinary single-device
 * load, where local is a mirror of what the server already has. Both dominate,
 * and the later timestamp wins, which resolves to local whenever the last write
 * never made it out. That is exactly right: same history, freshest copy, no
 * question asked.
 */
export function chooseSave<T>({ local, cloud, monotonic, savedAt }: ChooseSaveInput<T>): SaveChoice<T> {
  if (!local && !cloud) return { kind: 'none' };
  if (!local) return { kind: 'resolved', origin: 'cloud', save: cloud! };
  if (!cloud) return { kind: 'resolved', origin: 'local', save: local };

  const localCounters = monotonic(local);
  const cloudCounters = monotonic(cloud);
  const localAhead = dominates(localCounters, cloudCounters);
  const cloudAhead = dominates(cloudCounters, localCounters);

  if (localAhead && cloudAhead) {
    return savedAt(local) >= savedAt(cloud)
      ? { kind: 'resolved', origin: 'local', save: local }
      : { kind: 'resolved', origin: 'cloud', save: cloud };
  }
  if (localAhead) return { kind: 'resolved', origin: 'local', save: local };
  if (cloudAhead) return { kind: 'resolved', origin: 'cloud', save: cloud };

  return { kind: 'conflict', local, cloud };
}
