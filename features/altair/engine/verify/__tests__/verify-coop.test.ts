// Server-side verification of co-op runs. Money/data integrity: a co-op result is only ever
// persisted from the replay, so every way of lying about a run must be REJECTED and an honest run
// must replay to identical numbers. The "honest run" is a real HostSim run recorded by its own
// RunRecorder (the same code path the host's browser uses).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { verifyCoopRun } from '../verify-coop';
import { playHonestRun, SEED, type Recorded } from './fixture';
import { checkRunLog, MAX_RUN_STEPS, MAX_LOG_NUMBERS, EV_INPUT } from '../run-log';
import { replayRun } from '../replay';
import { SIM_VERSION } from '../../sim-version';

// A full replay is a few seconds of CPU; keep a loaded CI worker from tripping the 5 s default.
vi.setConfig({ testTimeout: 120_000 });

/** ALTAIR_VERIFY_VERBOSE=1 prints the measured numbers (used for PR evidence). */
const say = (...a: unknown[]) => {
  if (process.env.ALTAIR_VERIFY_VERBOSE) console.warn(...a);
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let honest: Recorded;
beforeAll(() => {
  honest = playHonestRun();
}, 120_000);

describe('honest run', () => {
  it('is long enough to mean something (kills, picks, a drop-in, a leave, an ended run)', () => {
    expect(honest.log.steps).toBeGreaterThan(1200);
    expect(honest.claim.sharedKills).toBeGreaterThan(0);
    expect(honest.log.joins).toHaveLength(1);
    expect(honest.log.ev.length).toBeGreaterThan(40);
    const kinds = new Set<number>();
    const chk = checkRunLog(honest.log);
    if (chk.ok) for (const e of chk.events) kinds.add(e.type);
    expect([...kinds].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is ACCEPTED and the verified numbers are identical to what the host reported', async () => {
    const out = await verifyCoopRun(honest.trusted, clone(honest.log), honest.claim);
    if (!out.ok) throw new Error(`honest run rejected: ${out.reason}: ${out.detail}`);
    expect(out.verified.sharedKills).toBe(honest.claim.sharedKills);
    expect(out.verified.victory).toBe(honest.claim.victory);
    for (const c of honest.claim.players) {
      const v = out.verified.players.find((p) => p.userId === c.userId)!;
      expect({ level: v.level, kills: v.kills, coins: v.coins }).toEqual({ level: c.level, kills: c.kills, coins: c.coins });
    }
    say(
      `[verify] honest run: ${honest.log.steps} steps, ${honest.log.ev.length} log numbers, kills=${out.verified.sharedKills}, ` +
        out.verified.players.map((p) => `${p.userId}:L${p.level}/${p.kills}k/${p.coins}c`).join(' '),
    );
  });

  it('two replays requested at once give identical results (they are serialised, not interleaved)', async () => {
    const [a, b] = await Promise.all([replayRun(clone(honest.log)), replayRun(clone(honest.log))]);
    expect(a).toMatchObject({ ok: true });
    expect(a).toEqual(b);
  });
});

describe('the sim version stamp', () => {
  it('a recorded log carries the version it was played on', () => {
    expect(honest.log.sim).toBe(SIM_VERSION);
  });

  it('a log played on another version is stale_sim, not a claim mismatch', async () => {
    const log = clone(honest.log);
    log.sim = SIM_VERSION + 1;
    expect(await verifyCoopRun(honest.trusted, log, honest.claim)).toMatchObject({ ok: false, reason: 'stale_sim' });
  });

  it('a log recorded before the stamp existed is version 1: it verifies on a server at 1 and is stale on any later one', async () => {
    const log = clone(honest.log);
    delete log.sim;
    const out = await verifyCoopRun(honest.trusted, log, honest.claim);
    if (SIM_VERSION === 1) expect(out.ok).toBe(true);
    else expect(out).toMatchObject({ ok: false, reason: 'stale_sim' });
  });

  it('refuses a malformed version field outright', () => {
    for (const bad of [0, -1, 1.5, '2', null]) {
      const log = clone(honest.log) as unknown as Record<string, unknown>;
      log.sim = bad;
      expect(checkRunLog(log)).toMatchObject({ ok: false, reason: 'bad sim version' });
    }
  });
});

describe('tampered runs are REJECTED', () => {
  const rejected = async (log: unknown, claim = honest.claim, trusted = honest.trusted) => verifyCoopRun(trusted, log, claim);

  it('inflated claimed kills', async () => {
    const claim = clone(honest.claim);
    claim.players[0].kills += 500;
    const out = await rejected(clone(honest.log), claim);
    expect(out).toMatchObject({ ok: false, reason: 'claim_mismatch' });
    say('[verify] inflated kills ->', out.ok ? 'ACCEPTED?!' : `${out.reason}: ${out.detail}`);
  });

  it('inflated claimed coins and shared kills, and a victory the replay did not reach', async () => {
    const claim = clone(honest.claim);
    claim.players[1].coins += 100_000;
    claim.sharedKills += 1000;
    claim.victory = !claim.victory;
    const out = await rejected(clone(honest.log), claim);
    expect(out).toMatchObject({ ok: false, reason: 'claim_mismatch' });
    say('[verify] inflated coins ->', out.ok ? 'ACCEPTED?!' : `${out.reason}: ${out.detail}`);
  });

  it('edited inputs (the log no longer produces the claimed result)', async () => {
    const log = clone(honest.log);
    // Rewrite every input event so the team walks the other way.
    for (let i = 0; i < log.ev.length; ) {
      const type = log.ev[i + 1];
      if (type === EV_INPUT) {
        log.ev[i + 3] = -log.ev[i + 3];
        log.ev[i + 4] = -log.ev[i + 4];
        i += 5;
      } else i += type === 1 ? 4 : 3;
    }
    const out = await rejected(log);
    expect(out.ok).toBe(false);
    say('[verify] edited inputs ->', out.ok ? 'ACCEPTED?!' : `${out.reason}: ${out.detail}`);
  });

  it('a single edited input mid-run', async () => {
    const log = clone(honest.log);
    // Find an input event ~60% of the way through and nudge it.
    let i = 0;
    let seen = 0;
    const chk = checkRunLog(log);
    if (!chk.ok) throw new Error('fixture invalid');
    const target = Math.floor(chk.events.filter((e) => e.type === EV_INPUT).length * 0.6);
    while (i < log.ev.length) {
      const type = log.ev[i + 1];
      if (type === EV_INPUT) {
        if (seen++ === target) {
          log.ev[i + 3] = -log.ev[i + 3];
          log.ev[i + 4] = -log.ev[i + 4];
          break;
        }
        i += 5;
      } else i += type === 1 ? 4 : 3;
    }
    const out = await rejected(log);
    expect(out.ok).toBe(false);
  });

  it('a log recorded with a different seed (log.seed edited)', async () => {
    const log = clone(honest.log);
    log.seed = SEED + 1;
    expect(await rejected(log)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('the hub seed differs from the one the host played with', async () => {
    const trusted = { ...honest.trusted, seed: SEED + 7 };
    expect(await rejected(clone(honest.log), honest.claim, trusted)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('a truncated log (steps cut short)', async () => {
    const log = clone(honest.log);
    log.steps = Math.floor(log.steps / 2);
    // events past the new end are dropped by the cheater too
    const chk = checkRunLog(honest.log);
    if (!chk.ok) throw new Error('fixture invalid');
    const out = await rejected(log);
    expect(out.ok).toBe(false);
    expect(['invalid_log', 'incomplete']).toContain(out.ok ? '' : out.reason);
  });

  it('a log claiming more steps than the run had', async () => {
    const log = clone(honest.log);
    log.steps += 600;
    expect(await rejected(log)).toMatchObject({ ok: false, reason: 'step_mismatch' });
  });

  it('an over-long run', async () => {
    const log = clone(honest.log);
    log.steps = MAX_RUN_STEPS + 1;
    const trusted = { ...honest.trusted, wallMs: 10 * 3600 * 1000 }; // the wall clock would allow it; the cap still does not
    expect(await rejected(log, honest.claim, trusted)).toMatchObject({ ok: false, reason: 'invalid_log' });
  });

  it('an over-long event list', async () => {
    const log = clone(honest.log);
    log.ev = new Array(MAX_LOG_NUMBERS + 5).fill(0);
    expect(await rejected(log)).toMatchObject({ ok: false, reason: 'invalid_log' });
  });

  it('malformed events (unknown type, out-of-circle input, a ghost player, ticks after the end)', async () => {
    for (const ev of [
      [0, 9, 0],
      [0, EV_INPUT, 0, 100, 100],
      [0, EV_INPUT, 7, 1, 1],
      [honest.log.steps + 5, EV_INPUT, 0, 1, 1],
      [0, EV_INPUT, 0, 1.5, 0],
      [0, EV_INPUT, 0],
    ]) {
      const log = clone(honest.log);
      log.joins = [];
      log.ev = ev;
      expect(await rejected(log), JSON.stringify(ev)).toMatchObject({ ok: false });
    }
  });

  it('more sim time than the hub saw on the wall clock (fast-forwarded host)', async () => {
    const trusted = { ...honest.trusted, wallMs: (honest.log.steps / 60) * 1000 * 0.4 };
    expect(await rejected(clone(honest.log), honest.claim, trusted)).toMatchObject({ ok: false, reason: 'too_long_for_wall_clock' });
  });

  it('a roster the hub never had (extra teammate) or a changed class', async () => {
    const extra = clone(honest.log);
    extra.roster.push({ id: 'ghost', classId: 'knight', slot: 3 });
    expect(await rejected(extra)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
    const swapped = clone(honest.log);
    swapped.roster[0].classId = 'berserker';
    expect(await rejected(swapped)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('a drop-in the hub never admitted', async () => {
    const log = clone(honest.log);
    log.joins[0].id = 'mallory';
    expect(await rejected(log)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('a verifier that is out of time gives up instead of running on', async () => {
    let t = 0;
    const out = await verifyCoopRun(honest.trusted, clone(honest.log), honest.claim, { timeoutMs: 1000, now: () => (t += 600), chunkSteps: 200 });
    expect(out).toMatchObject({ ok: false, reason: 'timeout' });
  });
});
