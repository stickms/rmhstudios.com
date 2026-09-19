/**
 * Daily Puzzle replays (P4) — re-scoring a run against the puzzle it was played
 * on.
 *
 * ## The hole this closes
 *
 * `POST /api/daily-puzzles/score` takes `body.score` and writes it down. There
 * is no check of any kind: the daily leaderboards have always been a record of
 * what people's browsers claimed. Every mode already computes its score with a
 * pure function over data the server could read, so the only thing missing was
 * somewhere to do it.
 *
 * ## Why this is `verifyAsync`
 *
 * Lights Out rebuilds its board from a seed, so a pure `verify()` is enough. A
 * Daily Puzzle cannot: four of the five modes are written by a model and stored
 * in `DailyPuzzle`, so the solution lives in a row. Accepting the puzzle from
 * the client alongside the answers would be asking the player to mark their own
 * paper — so the replay carries only `(mode, dateKey, inputs)` and the row is
 * fetched here.
 *
 * ## What a replay is, per mode
 *
 * The input log is in every case exactly what the game already put in
 * `resultJson`, which is why adoption is small: the client was recording the
 * right thing and throwing away the ability to check it.
 *
 *   alibi      ordered guesses (≤2) + seconds
 *   outcast    one guess per round (5)
 *   spectrum   the player's final ordering
 *   chainlink  the chain of words the player built
 *   impostor   the statements picked, per guess
 */

import { prisma } from '@/lib/prisma.server';
import { dailyPuzzleReplaySchema } from '@/lib/daily-puzzles/replay-schema';
import { checkAlibiGuess, computeAlibiScore } from '@/lib/daily-puzzles/alibi';
import { checkOutcastGuess, computeOutcastScore } from '@/lib/daily-puzzles/outcast';
import { computeSpectrumScore } from '@/lib/daily-puzzles/spectrum';
import { computeChainlinkScore, validateChain } from '@/lib/daily-puzzles/chainlink';
import { checkImpostorGuess, computeImpostorScore } from '@/lib/daily-puzzles/impostor';


/** Narrow a log element to a plain token, or null when it is a group. */
function one(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
/** Narrow a log element to a group of tokens, or null when it is a token. */
function many(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
}

/**
 * Re-score a Daily Puzzle run.
 *
 * Returns null for anything that does not add up — a missing puzzle, a log that
 * does not fit the mode, a guess naming something that is not in the puzzle.
 * `saveReplay` turns that into VERIFY_FAILED, which is the right answer to both
 * a corrupt payload and a forged one; telling the two apart would only help
 * whoever is forging.
 */
export async function verifyDailyPuzzle(data: unknown): Promise<{ score: number } | null> {
  const parsed = dailyPuzzleReplaySchema.safeParse(data);
  if (!parsed.success) return null;
  const { mode, dateKey, inputs, timeSeconds } = parsed.data;

  const row = await prisma.dailyPuzzle.findUnique({
    where: { gameMode_dateKey: { gameMode: mode, dateKey } },
    select: { data: true },
  });
  if (!row?.data) return null;
  const puzzle = row.data as Record<string, unknown>;

  switch (mode) {
    case 'alibi': {
      // One or two guesses; the score depends on which one landed.
      const guesses = inputs.map(one);
      if (guesses.length < 1 || guesses.length > 2 || guesses.some((g) => g === null)) return null;
      const typed = puzzle as unknown as Parameters<typeof checkAlibiGuess>[0];
      if (!typed?._solution?.guiltyName) return null;

      for (let i = 0; i < guesses.length; i++) {
        if (checkAlibiGuess(typed, guesses[i]!)) {
          // A correct guess ends the run: a log that continues past one is
          // describing a game that could not have been played.
          if (i !== guesses.length - 1) return null;
          return { score: computeAlibiScore(true, i + 1, timeSeconds) };
        }
      }
      return { score: computeAlibiScore(false, guesses.length, timeSeconds) };
    }

    case 'outcast': {
      const rounds = puzzle.rounds as Parameters<typeof checkOutcastGuess>[0][] | undefined;
      if (!Array.isArray(rounds) || rounds.length !== 5) return null;
      const guesses = inputs.map(one);
      if (guesses.length !== 5 || guesses.some((g) => g === null)) return null;
      return {
        score: computeOutcastScore(rounds.map((r, i) => checkOutcastGuess(r, guesses[i]!))),
      };
    }

    case 'spectrum': {
      const solution = puzzle._solution as Parameters<typeof computeSpectrumScore>[1] | undefined;
      if (!Array.isArray(solution) || solution.length === 0) return null;
      const order = inputs.map(one);
      if (order.length !== solution.length || order.some((o) => o === null)) return null;
      // Every item ordered exactly once, or the ranking is not a ranking.
      const names = new Set(solution.map((s) => s.name));
      if (new Set(order).size !== order.length) return null;
      if (order.some((o) => !names.has(o!))) return null;
      return { score: computeSpectrumScore(order as string[], solution).points };
    }

    case 'chainlink': {
      const start = puzzle.startWord;
      const end = puzzle.endWord;
      if (typeof start !== 'string' || typeof end !== 'string') return null;
      const chain = inputs.map(one);
      if (chain.length < 2 || chain.some((c) => c === null)) return null;
      if (chain[0] !== start || chain.at(-1) !== end) return null;
      // `validateChain` is the same vocabulary check the client ran; a chain
      // that fails it scores nothing rather than failing verification, because
      // an invalid chain is a real thing a player can submit.
      if (!validateChain(chain as string[]).valid) return { score: 0 };
      return { score: computeChainlinkScore(chain.length) };
    }

    case 'impostor': {
      const typed = puzzle as unknown as Parameters<typeof checkImpostorGuess>[0];
      if (!Array.isArray(typed?._solution)) return null;
      // Each element is one guess: the set of statements picked that time.
      const guesses = inputs.map(many);
      if (guesses.length < 1 || guesses.length > 2 || guesses.some((g) => g === null)) return null;

      let foundBothOnGuess: number | null = null;
      const found = new Set<string>();
      for (let i = 0; i < guesses.length; i++) {
        const { correctTexts } = checkImpostorGuess(typed, guesses[i]!);
        for (const t of correctTexts) found.add(t);
        if (foundBothOnGuess === null && found.size >= 2) foundBothOnGuess = i + 1;
      }
      return { score: computeImpostorScore(foundBothOnGuess, found.size) };
    }
  }
}
