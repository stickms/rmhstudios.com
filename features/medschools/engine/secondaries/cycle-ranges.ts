import { cycleLabel, cycleLabelIsolated } from '../cycle';

/**
 * How the cycles a prompt was observed in read: runs of consecutive cycles collapse, a gap starts a new range, and each
 * cycle is the site's `2026–2027` label (entry year 2027). Client-safe: imported by the Secondaries tab.
 *
 *   [2024, 2025, 2026, 2028]  ->  "2023–2024 to 2025–2026, 2027–2028"
 */

export interface CycleRange {
  from: number;
  to: number;
}

/** Sorted, de-duplicated, consecutive runs merged. Non-integers are ignored. */
export function cycleRanges(years: readonly number[]): CycleRange[] {
  const sorted = [...new Set(years.filter((y) => Number.isInteger(y)))].sort((a, b) => a - b);
  const out: CycleRange[] = [];
  for (const y of sorted) {
    const last = out[out.length - 1];
    if (last && y === last.to + 1) last.to = y;
    else out.push({ from: y, to: y });
  }
  return out;
}

export interface FormatCycleRangesOptions {
  /** How one cycle is written; defaults to `cycleLabel`. */
  label?: (cycleYear: number) => string;
  /** Between the two ends of a run; defaults to " to ". */
  joiner?: string;
  /** Between ranges; defaults to ", ". */
  separator?: string;
}

export function formatCycleRanges(years: readonly number[], options: FormatCycleRangesOptions = {}): string {
  const label = options.label ?? cycleLabel;
  const joiner = options.joiner ?? ' to ';
  const separator = options.separator ?? ', ';
  return cycleRanges(years)
    .map((r) => (r.from === r.to ? label(r.from) : `${label(r.from)}${joiner}${label(r.to)}`))
    .join(separator);
}

/** For the pages: each cycle in a left-to-right isolate so a right-to-left sentence keeps the years in order. */
export function formatCycleRangesIsolated(
  years: readonly number[],
  options: Omit<FormatCycleRangesOptions, 'label'> = {},
): string {
  return formatCycleRanges(years, { ...options, label: cycleLabelIsolated });
}
