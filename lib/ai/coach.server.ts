/**
 * Post-run coaching (A7). Server-only.
 *
 * After a game run the site shows a score and a leaderboard position, which
 * tells a player how they did and nothing about why. This turns a run into two
 * or three specific, evidenced suggestions — "you died to the third wave four
 * times and never used the dash" — which is the difference between a scoreboard
 * and a game that teaches.
 *
 * **The hard rule is that this is a pure function over `RunFacts`.** It reads no
 * replay, opens no database connection, and resolves nothing by id. Three
 * consequences, all of them the point:
 *
 *  - Every claim in the output traces to a number the *caller* computed. The
 *    prompt requires each tip to cite one, so a hallucinated ability or an
 *    invented death count has nowhere to come from.
 *  - It can run anywhere — a socket handler at end-of-match, a worker doing a
 *    backfill, a test — without a Prisma client or a live run to point at.
 *  - Whoever owns the game owns the facts. Adding a new signal is a change to
 *    the per-game code that already knows what a "wave" or an "ability" is, not
 *    a change here.
 *
 * The counterpart to that rule: the caller must have already checked that the
 * facts describe a run the requesting user is entitled to see coaching for.
 * This module cannot check, because it cannot look anything up.
 */

import { z } from 'zod';
import { runTaskJson, isAiConfigured } from '@/lib/ai/provider.server';
import { asData, systemFor, RUN_COACH } from '@/lib/ai/prompts';

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

/** One death, as the game already understands it. */
export interface RunDeath {
  /** What killed them, in the game's own vocabulary ("wave-3", "spike", "timer"). */
  cause: string;
  /** Milliseconds into the run. Lets the model notice deaths clustering. */
  atMs: number;
}

/**
 * Everything the coach is allowed to know.
 *
 * Percentiles are supplied rather than derived because they are the two facts
 * that make advice land: `percentileVsSelf` is whether this run was good *for
 * them*, `percentileVsAll` is whether it was good at all, and confusing the two
 * produces the condescending output the prompt explicitly forbids.
 */
export interface RunFacts {
  /** Catalog id from `lib/games.ts`. Names the game for the model; never resolved. */
  gameId: string;
  score: number;
  durationMs: number;
  deaths: RunDeath[];
  /** Abilities/items the player had available and never triggered. */
  unusedAbilities: string[];
  /** 0–100 against this player's own history. */
  percentileVsSelf: number;
  /** 0–100 against every player of this game. */
  percentileVsAll: number;
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

const MAX_HEADLINE_CHARS = 80;
const MAX_TIP_CHARS = 160;
const MAX_EVIDENCE_CHARS = 120;
/** The prompt asks for at most three; enforced here because a prompt is not a contract. */
const MAX_TIPS = 3;

/**
 * Trim-and-truncate to `max`, tolerating a non-string.
 *
 * Lenient by design at the field level, strict at the whole-result level below:
 * one malformed tip should cost that tip, not the entire coaching panel, so
 * emptiness is filtered out in `coachRun` rather than failing the parse here.
 */
const clamped = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().slice(0, max) : ''), z.string().max(max));

const adviceSchema = z.object({
  // The one required field: no headline means the model did not answer, and
  // there is nothing to salvage.
  headline: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_HEADLINE_CHARS) : ''),
    z.string().min(1).max(MAX_HEADLINE_CHARS),
  ),
  tips: z
    .array(
      z.object({
        tip: clamped(MAX_TIP_CHARS),
        /** The number this tip is based on. Without one the claim is unsupported. */
        evidence: clamped(MAX_EVIDENCE_CHARS),
      }),
    )
    .max(MAX_TIPS)
    .default([]),
});

export type CoachAdvice = z.infer<typeof adviceSchema>;
export type CoachTip = CoachAdvice['tips'][number];

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

/** Caps so one pathological run cannot become a large prompt. */
const MAX_DEATHS = 20;
const MAX_ABILITIES = 12;

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/**
 * Render facts as lines rather than JSON.
 *
 * Deliberate: a JSON blob invites the model to echo the structure back, and the
 * prompt wants prose tips citing numbers. Lines with explicit units read as
 * observations, which is what they are.
 */
function factsToText(facts: RunFacts): string {
  const deaths = facts.deaths.slice(0, MAX_DEATHS);
  const byCause = new Map<string, number>();
  for (const d of deaths) byCause.set(d.cause, (byCause.get(d.cause) ?? 0) + 1);

  return [
    `game: ${facts.gameId}`,
    `score: ${facts.score}`,
    `duration: ${seconds(facts.durationMs)}s`,
    `deaths: ${facts.deaths.length}`,
    ...[...byCause.entries()].map(([cause, n]) => `  died to "${cause}" ${n} time(s)`),
    ...deaths.map((d) => `  death at ${seconds(d.atMs)}s from "${d.cause}"`),
    `unused abilities: ${
      facts.unusedAbilities.slice(0, MAX_ABILITIES).join(', ') || 'none — every ability was used'
    }`,
    `percentile vs their own past runs: ${Math.round(facts.percentileVsSelf)}`,
    `percentile vs all players: ${Math.round(facts.percentileVsAll)}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Coach one finished run.
 *
 * Returns `null` — never throws — when AI is unconfigured, the provider fails,
 * or the output does not validate. A run summary without coaching is the
 * screen that ships today, so the degraded path is already designed.
 *
 * `userId` is ledger attribution only; it is not read, resolved, or checked.
 * Callers on a user-facing route should assert `assertAiBudget(userId)`
 * themselves before calling — it is left out here so the same function can run
 * inside a worker, where there is no user to bill and no budget to enforce.
 */
export async function coachRun(
  facts: RunFacts,
  opts: { userId?: string | null } = {},
): Promise<CoachAdvice | null> {
  if (!isAiConfigured()) return null;

  try {
    const advice = await runTaskJson(
      'summarize',
      systemFor(RUN_COACH),
      // `gameId`, `cause` and ability names are strings the game supplies, and
      // in a platform with user-authored levels and builds that means they can
      // ultimately be user-authored too. Framed as data for the same reason
      // every other caller does it.
      asData(factsToText(facts)),
      (value) => adviceSchema.parse(value),
      { userId: opts.userId ?? null, promptId: RUN_COACH.id, promptVer: RUN_COACH.version },
    );

    // Tips are dropped unless they carry both halves. The prompt requires a
    // cited number for every tip precisely so an unsupported claim is
    // *detectable* — this is where that requirement is actually enforced.
    // A headline with no surviving tips is a compliment rather than coaching,
    // but it still beats an empty panel, so it is returned.
    return { ...advice, tips: advice.tips.filter((t) => t.tip !== '' && t.evidence !== '') };
  } catch (err) {
    console.warn('[ai] run coach failed:', (err as Error)?.message);
    return null;
  }
}
