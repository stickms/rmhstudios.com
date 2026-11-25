/**
 * "Made here" — the profile module that lists what a member has made (sprint 12, feature 07).
 *
 * Client-safe: the five kinds, the per-kind cap and the row shape the endpoint answers with. The module's saved
 * config (`kinds`, in `./modules-schema`) and the endpoint's `?kinds=` read the same list.
 */

/** The kinds of work the module can list, in the order the rows are grouped. */
export const MADE_KINDS = ['connections', 'lights-out', 'deck', 'chart', 'build'] as const;
export type MadeKind = (typeof MADE_KINDS)[number];

/** At most this many rows of each kind. */
export const MADE_PER_KIND = 4;

/** What a row's one figure counts. `difficulty` carries the chart's tier name as its value. */
export type MadeFigureUnit = 'plays' | 'cards' | 'releases' | 'difficulty';

export interface MadeFigure {
  unit: MadeFigureUnit;
  value: number | string;
}

export interface MadeItem {
  kind: MadeKind;
  id: string;
  /** Member-written text: render it with `dir="auto"`. */
  title: string;
  href: string;
  figure: MadeFigure;
}

export interface MadeResponse {
  items: MadeItem[];
}

export function isMadeKind(value: string): value is MadeKind {
  return (MADE_KINDS as readonly string[]).includes(value);
}

/**
 * The `?kinds=` list: comma-separated, unknown names dropped, repeats collapsed, order of `MADE_KINDS`.
 * `undefined` (no parameter) means every kind; an empty string means none.
 */
export function parseMadeKinds(raw: string | undefined): MadeKind[] {
  if (raw === undefined) return [...MADE_KINDS];
  const wanted = new Set(raw.split(',').map((k) => k.trim()));
  return MADE_KINDS.filter((k) => wanted.has(k));
}

/** The `?kinds=` value for a module's saved kinds; `undefined` when all are ticked (the default, a shorter URL). */
export function madeKindsParam(kinds: readonly MadeKind[]): string | undefined {
  const picked = MADE_KINDS.filter((k) => kinds.includes(k));
  return picked.length === MADE_KINDS.length ? undefined : picked.join(',');
}
