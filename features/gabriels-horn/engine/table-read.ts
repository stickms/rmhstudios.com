/**
 * Gabriel's Horn table read (R11) — per-game accumulators and the numbers the
 * post-game panel shows. Pure: the socket handler feeds it, the panel reads it.
 */

/** What one seat did this game. Ms are clamped so one stalled tab can't skew a career. */
export interface ReadAcc {
  claims: number;
  lies: number;
  calls: number;
  callsCorrect: number;
  lieClaimMs: number;
  truthClaimMs: number;
}

export interface TableReadRow extends ReadAcc {
  socketId: string;
}

export const MAX_CLAIM_MS = 120_000;

export function emptyAcc(): ReadAcc {
  return { claims: 0, lies: 0, calls: 0, callsCorrect: 0, lieClaimMs: 0, truthClaimMs: 0 };
}

export function recordClaim(acc: ReadAcc, lie: boolean, claimMs: number): void {
  const ms = Math.max(0, Math.min(MAX_CLAIM_MS, Math.round(claimMs)));
  acc.claims++;
  if (lie) {
    acc.lies++;
    acc.lieClaimMs += ms;
  } else {
    acc.truthClaimMs += ms;
  }
}

export function recordCall(acc: ReadAcc, correct: boolean): void {
  acc.calls++;
  if (correct) acc.callsCorrect++;
}

export interface ReadSummary {
  /** 0..1, or null with no claims. */
  bluffRate: number | null;
  /** 0..1, or null with no calls. */
  callAccuracy: number | null;
  /** Seconds slower (+) or faster (-) you answer when bluffing; null without both kinds. */
  tellSeconds: number | null;
}

export function summarize(acc: ReadAcc): ReadSummary {
  const truths = acc.claims - acc.lies;
  return {
    bluffRate: acc.claims > 0 ? acc.lies / acc.claims : null,
    callAccuracy: acc.calls > 0 ? acc.callsCorrect / acc.calls : null,
    tellSeconds:
      acc.lies > 0 && truths > 0
        ? (acc.lieClaimMs / acc.lies - acc.truthClaimMs / truths) / 1000
        : null,
  };
}

/** Mean of each summary figure over everyone who has one. */
export function tableAverage(rows: ReadAcc[]): ReadSummary {
  const mean = (values: (number | null)[]): number | null => {
    const real = values.filter((v): v is number => v !== null);
    return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
  };
  const sums = rows.map(summarize);
  return {
    bluffRate: mean(sums.map((s) => s.bluffRate)),
    callAccuracy: mean(sums.map((s) => s.callAccuracy)),
    tellSeconds: mean(sums.map((s) => s.tellSeconds)),
  };
}
