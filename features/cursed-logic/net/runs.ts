/**
 * Cursed Logic's client calls (features/CLAUDE.md `net/`): submitting a finished run and reading the board, through
 * the typed contracts. The store submits when a run ends (an action, not an effect); the board component reads.
 */
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import {
  getCursedLogicLeaderboardApi,
  submitCursedLogicScoreApi,
  type CursedLogicBoardRow,
} from '@features/cursed-logic/engine/cursed-logic.contract';
import type { RunState } from '@features/cursed-logic/engine/run';
import type { CursedLogicScoreBody } from '@features/cursed-logic/engine/score-schema';

/** The claim sent for a finished run, built from the run state exactly as the server re-checks it (`claimProblem`). */
export function runClaim(run: RunState, durationMs: number): CursedLogicScoreBody {
  const won = run.records.filter((r) => r.won);
  return {
    score: run.score,
    duelsWon: run.duelsWon,
    sector: run.sector,
    victory: run.victory,
    pacts: run.pacts,
    flawlessDuels: won.filter((r) => r.flawless).length,
    fastestDuel: won.length > 0 ? Math.min(...won.map((r) => r.rounds)) : 0,
    neverBelowHalf: run.neverBelowHalf,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

/** The score route's moment (a first score or a new best), read defensively. */
export interface Moment {
  kind: 'first-score' | 'pb';
  rank: number | null;
}

function parseMoment(body: unknown): Moment | null {
  const m = (body as { moment?: unknown } | null)?.moment as Record<string, unknown> | null | undefined;
  if (!m || (m.kind !== 'pb' && m.kind !== 'first-score')) return null;
  return { kind: m.kind, rank: typeof m.rank === 'number' ? m.rank : null };
}

export type Submission =
  { state: 'idle' | 'sending' | 'failed' | 'signed-out' } | { state: 'sent'; moment: Moment | null; unlocked: number };

/** Submit a finished run. Never throws: a refusal or a network error is a `failed`, a 401 is `signed-out`. */
export async function submitRun(run: RunState, durationMs: number): Promise<Submission> {
  try {
    const res = await api(submitCursedLogicScoreApi, { body: runClaim(run, durationMs) });
    return { state: 'sent', moment: parseMoment(res), unlocked: res.unlocked.length };
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) return { state: 'signed-out' };
    return { state: 'failed' };
  }
}

/** The global top ten. */
export async function loadBoard(): Promise<CursedLogicBoardRow[]> {
  const res = await api(getCursedLogicLeaderboardApi, {});
  return res.entries;
}
