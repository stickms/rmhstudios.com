// The persistence gate for solo runs: processSoloRun may only hand the REPLAY's numbers to the database,
// only when the replay agrees with the claim, and only once per run id.
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: vi.fn(async () => null) }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn() }));

import { processSoloRun, allowSoloSubmission, type SoloProcessDeps, type SoloRunRow } from '../queue.server';
import { verifySoloRun } from '../verify-solo';
import { MAX_SOLO_SUBMISSIONS_PER_HOUR, type SoloRunJob } from '../job';
import { reconcileMetaSave } from '../../meta-guard';
import { playSoloRun, type Recorded } from './fixture';

vi.setConfig({ testTimeout: 120_000 });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let honest: Recorded;
beforeAll(() => {
  honest = playSoloRun();
}, 120_000);

function rowFor(r: Recorded, over: Partial<SoloRunRow> = {}): SoloRunRow {
  return { id: 'run-1', userId: 'alice', seed: r.trusted.seed, classId: r.trusted.classId, doubleTime: r.trusted.doubleTime, loadout: r.trusted.loadout, status: 'submitted', ...over };
}
function jobFor(r: Recorded, over: Partial<SoloRunJob> = {}): SoloRunJob {
  return { runId: 'run-1', userId: 'alice', wallMs: r.trusted.wallMs, log: clone(r.log), claim: clone(r.claim), ...over };
}

/** A fake database: persist flips the status once (like the transaction's updateMany), refuses a second. */
function fakeDb(row: SoloRunRow) {
  const rows = new Map([[row.id, { ...row }]]);
  const credited: { runId: string; coins: number; kills: number }[] = [];
  const rejected: string[] = [];
  const verify = vi.fn(verifySoloRun);
  const deps: SoloProcessDeps = {
    load: async (id) => rows.get(id) ?? null,
    verify,
    persist: async (id, _user, run) => {
      const r = rows.get(id)!;
      if (r.status !== 'submitted') return { saved: false, reason: 'duplicate' };
      r.status = 'verified';
      credited.push({ runId: id, coins: run.finalCoins, kills: run.kills });
      return { saved: true, coins: run.finalCoins, firstClearBonus: 0 };
    },
    reject: async (id, reason) => {
      rows.get(id)!.status = 'rejected';
      rejected.push(reason);
    },
  };
  return { rows, credited, rejected, verify, deps };
}

describe('processSoloRun', () => {
  it('credits an honest run with the replay-computed numbers', async () => {
    const db = fakeDb(rowFor(honest));
    const out = await processSoloRun(jobFor(honest), db.deps);
    expect(out).toMatchObject({ status: 'saved' });
    expect(db.credited).toEqual([{ runId: 'run-1', coins: honest.result.finalCoins, kills: honest.result.kills }]);
  });

  it('a reused run id is a duplicate and costs no simulation', async () => {
    const db = fakeDb(rowFor(honest));
    await processSoloRun(jobFor(honest), db.deps);
    const again = await processSoloRun(jobFor(honest), db.deps);
    expect(again).toEqual({ status: 'duplicate' });
    expect(db.verify).toHaveBeenCalledTimes(1);
    expect(db.credited).toHaveLength(1);
  });

  it('a run that is not in the submitted state (open, abandoned, expired) is never replayed', async () => {
    for (const status of ['open', 'abandoned', 'expired', 'rejected']) {
      const db = fakeDb(rowFor(honest, { status }));
      expect(await processSoloRun(jobFor(honest), db.deps)).toEqual({ status: 'duplicate' });
      expect(db.verify).not.toHaveBeenCalled();
      expect(db.credited).toHaveLength(0);
    }
  });

  it("somebody else's run id, or an unknown one, credits nothing", async () => {
    const db = fakeDb(rowFor(honest));
    expect(await processSoloRun(jobFor(honest, { userId: 'mallory' }), db.deps)).toMatchObject({ status: 'rejected', reason: 'no_run' });
    expect(await processSoloRun(jobFor(honest, { runId: 'nope' }), db.deps)).toMatchObject({ status: 'rejected', reason: 'no_run' });
    expect(db.credited).toHaveLength(0);
  });

  it('the seed and loadout are the SERVER row\'s: a log recorded with a better one is rejected', async () => {
    const db = fakeDb(rowFor(honest, { loadout: { ...honest.trusted.loadout, revival: 0 } }));
    const out = await processSoloRun(jobFor(honest), db.deps);
    expect(out).toMatchObject({ status: 'rejected', reason: 'setup_mismatch' });
    const db2 = fakeDb(rowFor(honest, { seed: honest.trusted.seed + 7 }));
    expect(await processSoloRun(jobFor(honest), db2.deps)).toMatchObject({ status: 'rejected', reason: 'setup_mismatch' });
    expect(db.credited).toHaveLength(0);
    expect(db2.credited).toHaveLength(0);
  });

  it('an inflated claim is rejected and marks the run rejected (not paid, not retryable)', async () => {
    const db = fakeDb(rowFor(honest));
    const out = await processSoloRun(jobFor(honest, { claim: { ...honest.claim, finalCoins: honest.claim.finalCoins + 5000 } }), db.deps);
    expect(out).toMatchObject({ status: 'rejected', reason: 'claim_mismatch' });
    expect(db.rows.get('run-1')!.status).toBe('rejected');
    expect(db.credited).toHaveLength(0);
  });

  it('fast-forwarded time (more sim than the server saw wall clock) is rejected before any replay', async () => {
    const db = fakeDb(rowFor(honest));
    const out = await processSoloRun(jobFor(honest, { wallMs: 3000 }), db.deps);
    expect(out).toMatchObject({ status: 'rejected', reason: 'too_long_for_wall_clock' });
    expect(db.credited).toHaveLength(0);
  });

  it('truncated / padded / edited logs credit nothing', async () => {
    const truncated = clone(honest.log);
    truncated.steps = Math.floor(truncated.steps / 2);
    const padded = clone(honest.log);
    padded.steps += 300;
    const edited = clone(honest.log);
    edited.ev[4] = 0; // the first input (keys held) becomes standing still
    for (const log of [truncated, padded, edited]) {
      const db = fakeDb(rowFor(honest));
      const out = await processSoloRun(jobFor(honest, { log }), db.deps);
      expect(out.status).toBe('rejected');
      expect(db.credited).toHaveLength(0);
    }
  });
});

describe('submission rate limit', () => {
  it('allows a bounded number of submissions per user per hour', () => {
    const t0 = 1_000_000_000;
    for (let i = 0; i < MAX_SOLO_SUBMISSIONS_PER_HOUR; i++) expect(allowSoloSubmission('u1', t0 + i)).toBe(true);
    expect(allowSoloSubmission('u1', t0 + 100)).toBe(false);
    expect(allowSoloSubmission('u2', t0 + 100)).toBe(true);
    expect(allowSoloSubmission('u1', t0 + 3_600_001 + 100)).toBe(true);
  });
});

describe('meta save for a client whose runs are verified', () => {
  const prev = { coins: 100, upgrades: {}, coinAllowance: 8000, coinAllowanceAt: new Date(0) };
  const now = new Date(10_000_000);
  it('never raises the balance from the claim', () => {
    const d = reconcileMetaSave(prev, { coins: 5_000_000, upgrades: {} }, now, { verifiedOnly: true });
    expect(d).toMatchObject({ ok: true, coins: 100, clamped: true });
  });
  it('still lets the balance fall (spending) and unchanged balances through', () => {
    expect(reconcileMetaSave(prev, { coins: 40, upgrades: {} }, now, { verifiedOnly: true })).toMatchObject({ ok: true, coins: 40 });
    expect(reconcileMetaSave(prev, { coins: 100, upgrades: {} }, now, { verifiedOnly: true })).toMatchObject({ ok: true, coins: 100 });
  });
  it('the legacy path (old clients, unverifiable runs) keeps its capped allowance', () => {
    const d = reconcileMetaSave(prev, { coins: 5_000_000, upgrades: {} }, now);
    expect(d).toMatchObject({ ok: true });
    if (d.ok) expect(d.coins).toBeLessThanOrEqual(100 + 8000);
  });
});
