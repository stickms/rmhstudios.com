/**
 * Availability polls ("when can everyone make it?") — pure and client-safe.
 * Feature idea K1 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * When2Meet and Doodle answer one question the site cannot: a community game
 * night, a study group or a tournament round needs a time, and today the only
 * tool is a reply thread. The poll is a grid of fixed-length slots over a
 * window; each respondent marks the slots they can make (optionally "if need
 * be"); the organiser sees a heat map and a ranked shortlist.
 *
 * Everything is stored and computed in UTC epoch minutes. Slots are rendered
 * in each viewer's own timezone by the UI, which is the entire reason a
 * shared grid works across timezones and a reply thread does not.
 *
 * Ranking, in order:
 *   1. every REQUIRED respondent can make it (a slot missing one is excluded,
 *      not just ranked low — the organiser said they were required);
 *   2. most people available ("yes" counts 1, "if need be" counts 0.5);
 *   3. fewest "if need be" answers among those (people's real preference);
 *   4. earlier slot first.
 * Adjacent qualifying slots are merged into runs so "Tue 19:00–21:00" reads as
 * one option rather than four.
 */

export type Answer = 'yes' | 'maybe';

export interface PollWindow {
  /** UTC epoch minutes of the first slot. */
  startMin: number;
  /** UTC epoch minutes the window ends at (exclusive). */
  endMin: number;
  /** Slot length in minutes (15, 30 or 60 in practice). */
  slotMin: number;
}

export interface AvailabilityResponse {
  userId: string;
  required?: boolean;
  /** Slot start (UTC epoch minutes) → answer. Unlisted slots mean "no". */
  slots: Record<number, Answer>;
}

export interface SlotScore {
  startMin: number;
  yes: number;
  maybe: number;
  /** yes + 0.5 × maybe. */
  score: number;
  allRequired: boolean;
}

export interface Run {
  startMin: number;
  endMin: number;
  /** The weakest slot in the run — a run is only as good as its worst slot. */
  score: number;
  maybe: number;
}

export function slotStarts(w: PollWindow): number[] {
  if (w.slotMin <= 0 || w.endMin <= w.startMin) return [];
  const out: number[] = [];
  for (let t = w.startMin; t + w.slotMin <= w.endMin; t += w.slotMin) out.push(t);
  return out;
}

/** Per-slot tallies for the heat map. */
export function scoreSlots(w: PollWindow, responses: readonly AvailabilityResponse[]): SlotScore[] {
  return slotStarts(w).map((startMin) => {
    let yes = 0;
    let maybe = 0;
    let allRequired = true;
    for (const r of responses) {
      const a = r.slots[startMin];
      if (a === 'yes') yes++;
      else if (a === 'maybe') maybe++;
      else if (r.required) allRequired = false;
    }
    return { startMin, yes, maybe, score: yes + maybe / 2, allRequired };
  });
}

/**
 * The organiser's shortlist: runs of at least `minSlots` consecutive slots,
 * every one of which has all required respondents and at least `minScore`.
 */
export function bestRuns(
  w: PollWindow,
  responses: readonly AvailabilityResponse[],
  opts: { minSlots?: number; minScore?: number; limit?: number } = {},
): Run[] {
  const minSlots = Math.max(1, opts.minSlots ?? 1);
  const minScore = opts.minScore ?? 1;
  const limit = opts.limit ?? 5;
  const scored = scoreSlots(w, responses);

  const runs: Run[] = [];
  let open: Run | null = null;
  let len = 0;
  const close = () => {
    if (open && len >= minSlots) runs.push(open);
    open = null;
    len = 0;
  };

  for (const s of scored) {
    if (!s.allRequired || s.score < minScore) {
      close();
      continue;
    }
    if (open) {
      open.endMin = s.startMin + w.slotMin;
      open.score = Math.min(open.score, s.score);
      open.maybe = Math.max(open.maybe, s.maybe);
      len++;
    } else {
      open = {
        startMin: s.startMin,
        endMin: s.startMin + w.slotMin,
        score: s.score,
        maybe: s.maybe,
      };
      len = 1;
    }
  }
  close();

  return runs
    .sort((a, b) => b.score - a.score || a.maybe - b.maybe || a.startMin - b.startMin)
    .slice(0, limit);
}
