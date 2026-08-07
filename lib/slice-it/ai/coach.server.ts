/**
 * Slice It — post-run coaching and practice drills. Server-only.
 *
 * Features 1 and 2 of the Slice It AI tier, produced by **one** model call.
 * They are separated in the UI (tips read on the results card, drills are
 * buttons that start a practice run) and deliberately not separated here: a tip
 * that says "you lose the 1:40 burst" and a drill that loops 1:40 have to agree
 * with each other, and two independent calls agreeing is luck rather than
 * design.
 *
 * ## Why this exists next to `lib/ai/coach.server.ts`
 *
 * The generic coach takes `RunFacts` — deaths, unused abilities, percentiles —
 * which is the right vocabulary for a game where you die. A rhythm run has no
 * deaths and no abilities; it has a timing distribution, a judgement histogram
 * and a chart whose difficulty varies second by second. Forcing those through
 * `deaths[]` would either lose them or lie about them. The generic module stays
 * for the games it fits; this one speaks Slice It's own facts.
 *
 * The hard rule it inherits is the good one: **this is a pure function over
 * facts the caller computed.** It opens no database connection and resolves
 * nothing by id, so every number in the advice traces to something the caller
 * measured — and the caller is where entitlement to see the run was checked.
 */

import { SLICE_IT_COACH } from '@/lib/ai/prompts';
import { attempt } from './run.server';
import { coachAdviceSchema, type SliceCoachAdvice, type PracticeDrill } from './types';
import { runFactsToText, type SliceRunFacts } from './facts';

/** Shortest drill worth looping. Below this there is no phrase to practise. */
const MIN_DRILL_SEC = 5;
/** Longest drill. Past half a minute it is a replay of the song, not a drill. */
const MAX_DRILL_SEC = 40;

/**
 * Coach one finished Slice It run.
 *
 * Returns `null` when AI is unavailable or the output does not validate — the
 * results card renders without a coaching panel, which is the screen that
 * shipped before this feature existed.
 *
 * `userId` is ledger attribution only. Callers on a user-facing route must
 * `assertAiBudget(userId)` themselves; it is left out here so the same function
 * can run from a worker, where there is no account to bill.
 */
export async function coachSliceRun(
  facts: SliceRunFacts,
  opts: { userId?: string | null } = {},
): Promise<SliceCoachAdvice | null> {
  const advice = await attempt(SLICE_IT_COACH, coachAdviceSchema, runFactsToText(facts), opts);
  if (!advice) return null;

  return {
    ...advice,
    // A tip without evidence is an unsupported claim, and the prompt requires a
    // cited number precisely so that unsupported claims are *detectable*. This
    // is where that requirement is actually enforced — a prompt is not a
    // contract. A headline with no surviving tips is a compliment rather than
    // coaching, but it still beats an empty panel, so it is kept.
    tips: advice.tips.filter((t) => t.tip !== '' && t.evidence !== ''),
    drills: sanitizeDrills(advice.drills, facts.durationSec),
  };
}

/**
 * Drop drills that do not describe a playable span of *this* song.
 *
 * The schema clamps each field independently, which cannot catch the errors
 * that matter here: a start after the end, a zero-length span, a timestamp past
 * the end of the track, or three drills over the same ten seconds. Each of
 * those is a button that seeks somewhere useless, and a practice button that
 * does nothing is worse than no button.
 */
function sanitizeDrills(drills: PracticeDrill[], durationSec: number): PracticeDrill[] {
  const limit = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : Infinity;
  const kept: PracticeDrill[] = [];

  for (const drill of drills) {
    const startSec = Math.max(0, Math.min(drill.startSec, limit));
    const endSec = Math.min(drill.endSec, limit);
    const span = endSec - startSec;
    if (span < MIN_DRILL_SEC || span > MAX_DRILL_SEC) continue;
    if (!drill.label) continue;

    // Two drills over the same passage are one drill and a wasted slot.
    if (kept.some((k) => startSec < k.endSec && endSec > k.startSec)) continue;

    kept.push({
      ...drill,
      startSec: Math.round(startSec),
      endSec: Math.round(endSec),
      // A drill above 1.0x is not practice, whatever the model returned.
      suggestedSpeed: Math.min(1, Math.max(0.5, drill.suggestedSpeed)),
    });
  }

  return kept.sort((a, b) => a.startSec - b.startSec);
}
