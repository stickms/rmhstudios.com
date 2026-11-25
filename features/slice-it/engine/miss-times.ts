/**
 * Slice It — which notes of a chart a run missed (the sampled miss heatmap's input).
 *
 * Pure and browser-safe: the client builds the list from the engine's resolved notes and the score route checks it
 * against the chart it resolved, with the same functions on both sides.
 *
 * ## What is trusted, and what is not
 *
 * The times a client sends are a claim about a run the server never saw. They can only ever skew a sampled statistic
 * its chart's author reads — never a board, a rating or a coin — so the check is about keeping the statistic keyed
 * to real notes, not about proving the run: a time that is not one of the chart's own note times is dropped, a time
 * sent more often than the chart has notes at that instant is dropped, and a run that does not describe this chart's
 * whole note list (its count differs) records nothing at all.
 */

/** The most missed notes one submission may carry. */
export const MISS_TIMES_MAX = 5000;

/** The most notes a submission may say its chart has. */
export const NOTE_COUNT_MAX = 20_000;

/** Fewer sampled runs than this and the author is shown no heat: a rate over a handful of runs is noise. */
export const MIN_SAMPLED_RUNS = 5;

/** A note time as the heatmap keys it: whole milliseconds. */
export function noteMsOf(seconds: number): number {
  return Math.round(seconds * 1000);
}

/** One note's outcome in a run, as `recordNoteStats` takes it. */
export interface ChartNoteOutcome {
  noteMs: number;
  missed: boolean;
}

/** The times, in milliseconds, of every note in a stored chart. A malformed element is skipped. */
export function chartNoteTimesMs(notes: unknown): number[] {
  if (!Array.isArray(notes)) return [];
  const times: number[] = [];
  for (const note of notes) {
    const time = (note as { time?: unknown } | null)?.time;
    if (typeof time === 'number' && Number.isFinite(time) && time >= 0) times.push(noteMsOf(time));
  }
  return times;
}

/** The notes of the chart as the engine judged them, for the client's half: only the ones a player can miss. */
export function missedTimesMs(slices: readonly { time: number; type: string; hit?: boolean }[]): number[] {
  const missed: number[] = [];
  for (const slice of slices) {
    if (slice.type === 'BOMB' || slice.type === 'SILENT') continue;
    if (slice.hit !== true) missed.push(noteMsOf(slice.time));
    if (missed.length >= MISS_TIMES_MAX) break;
  }
  return missed;
}

export interface ValidatedMisses {
  /** Every note of the chart, each marked missed when the run's list (after validation) said so. */
  outcomes: ChartNoteOutcome[];
  /** Times the run sent that no note of the chart could account for. */
  dropped: number;
}

/**
 * Check a run's miss list against the chart it names.
 *
 * Returns `null` when nothing may be recorded: the count the run declared is not the chart's note count (the run
 * played a different list of notes than the one on file), or the list is missing.
 *
 * Several notes can share a millisecond (one per lane). A time may be sent once per such note and no more; the rest
 * are dropped.
 */
export function validateMissTimes(
  chartNotes: unknown,
  missedNoteMs: readonly number[] | undefined,
  noteCount: number | undefined,
): ValidatedMisses | null {
  if (missedNoteMs === undefined || noteCount === undefined) return null;
  const times = chartNoteTimesMs(chartNotes);
  if (times.length === 0 || noteCount !== times.length) return null;

  const budget = new Map<number, number>();
  for (const ms of times) budget.set(ms, (budget.get(ms) ?? 0) + 1);

  const missesAt = new Map<number, number>();
  let dropped = 0;
  for (const raw of missedNoteMs) {
    const ms = Math.round(raw);
    const left = (budget.get(ms) ?? 0) - (missesAt.get(ms) ?? 0);
    if (!Number.isFinite(ms) || left <= 0) {
      dropped += 1;
      continue;
    }
    missesAt.set(ms, (missesAt.get(ms) ?? 0) + 1);
  }

  const seen = new Map<number, number>();
  const outcomes = times.map((noteMs) => {
    const index = seen.get(noteMs) ?? 0;
    seen.set(noteMs, index + 1);
    return { noteMs, missed: index < (missesAt.get(noteMs) ?? 0) };
  });
  return { outcomes, dropped };
}

/* ─── The tint ─────────────────────────────────────────────────────────────── */

/** 0 is "no data"; 1 to 4 are the four strengths. */
export type HeatStep = 0 | 1 | 2 | 3 | 4;

/** The miss rate at which each step above 1 begins: under 10% is step 1, 10% to 25% step 2, 25% to 50% step 3. */
export const HEAT_THRESHOLDS = [0.1, 0.25, 0.5] as const;

/** The strength of the tint for a miss rate. `null` (nothing reached the bucket) is no tint at all. */
export function heatStep(rate: number | null): HeatStep {
  if (rate === null || !Number.isFinite(rate)) return 0;
  if (rate < HEAT_THRESHOLDS[0]) return 1;
  if (rate < HEAT_THRESHOLDS[1]) return 2;
  if (rate < HEAT_THRESHOLDS[2]) return 3;
  return 4;
}

/** A rate as a whole percentage, for the text beside the tint. */
export function ratePercent(rate: number): number {
  return Math.round(Math.max(0, Math.min(1, rate)) * 100);
}
