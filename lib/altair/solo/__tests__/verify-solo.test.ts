// Single-player run verification: an honest run (played the way the browser plays it, and a REAL
// browser recording) replays to identical numbers; every kind of tampered log is refused.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifySoloRun, replaySoloRun, type TrustedSoloSetup } from '../verify-solo';
import { SEV_INPUT, SEV_PICK, checkSoloLog, type SoloLog } from '../solo-log';
import { loadoutFromUpgrades } from '../loadout';
import { playSoloRun, type Recorded } from './fixture';

vi.setConfig({ testTimeout: 180_000 });

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

let honest: Recorded;
beforeAll(() => {
  honest = playSoloRun({ resizeAt: 700 });
}, 120_000);

describe('an honest run', () => {
  it('is long enough to mean something (picks, reroll, banish, resize, a death)', () => {
    expect(honest.log.end).toBe('dead');
    expect(honest.log.steps).toBeGreaterThan(1500);
    expect(honest.result.level).toBeGreaterThanOrEqual(4);
    const checked = checkSoloLog(honest.log);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const types = new Set(checked.events.map((e) => e.type));
    for (const t of [0, 1, 2, 3, 4]) expect(types.has(t as never)).toBe(true);
  });

  it('replays to exactly the numbers the player saw', async () => {
    const out = await verifySoloRun(honest.trusted, clone(honest.log), honest.claim);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.verified).toEqual(honest.result);
  });

  it('replays the same twice (the replay leaves no state behind)', async () => {
    const a = await replaySoloRun(clone(honest.log));
    const b = await replaySoloRun(clone(honest.log));
    expect(a).toEqual(b);
  });
});

interface BrowserRun {
  name: string;
  description: string;
  log: SoloLog;
  result: { status: string; kills: number; level: number; finalCoins: number };
}
const BROWSER_RUNS = (JSON.parse(readFileSync(join(__dirname, 'browser-runs.json'), 'utf8')) as { runs: BrowserRun[] }).runs;

// Recorded in real Chromium (WebGL, real keyboard presses and level-up clicks, a tab-hide pause, a
// canvas resize) from GameScreen, then replayed here in Node: the numbers must be identical.
describe('recorded REAL browser runs', () => {
  for (const rec of BROWSER_RUNS) {
    it(`${rec.name} (${rec.description}) replays to identical numbers`, async () => {
      const trusted: TrustedSoloSetup = {
        seed: rec.log.seed,
        classId: rec.log.classId,
        doubleTime: rec.log.doubleTime,
        loadout: rec.log.loadout,
        wallMs: (rec.log.steps / 60) * 1000 + 5000,
      };
      const out = await verifySoloRun(trusted, clone(rec.log), {
        victory: rec.result.status === 'victory',
        kills: rec.result.kills,
        level: rec.result.level,
        finalCoins: rec.result.finalCoins,
      });
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.verified).toEqual(rec.result);
    });
  }

  it('the recordings cover a pick, a resize and a run left open', () => {
    const types = new Set<number>();
    for (const r of BROWSER_RUNS) {
      const c = checkSoloLog(r.log);
      expect(c.ok).toBe(true);
      if (c.ok) for (const e of c.events) types.add(e.type);
    }
    expect(types.has(SEV_PICK)).toBe(true);
    expect(types.has(4)).toBe(true);
    expect(BROWSER_RUNS.some((r) => r.log.end === 'quit')).toBe(true);
    expect(BROWSER_RUNS.some((r) => r.log.end === 'dead')).toBe(true);
  });
});

describe('tampered runs are refused', () => {
  const reason = async (log: unknown, trusted = honest.trusted, claim = honest.claim) => {
    const out = await verifySoloRun(trusted, log, claim);
    return out.ok ? 'accepted' : out.reason;
  };

  it('edited inputs: the replay no longer reaches the claimed result', async () => {
    const log = clone(honest.log);
    // Turn every input event into "stand still" for the first part of the run.
    const checked = checkSoloLog(log);
    if (!checked.ok) throw new Error('fixture log invalid');
    let i = 0;
    let tick = 0;
    while (i < log.ev.length) {
      tick += log.ev[i];
      const type = log.ev[i + 1];
      if (type === SEV_INPUT) {
        if (tick < 1500) log.ev[i + 4] = 0;
        i += 5;
      } else if (type === SEV_PICK) i += 3;
      else if (type === 2) i += 2;
      else if (type === 3) i += 3;
      else i += 4;
    }
    expect(await reason(log)).not.toBe('accepted');
  });

  it('an inflated claim (more kills, more coins) is refused', async () => {
    expect(await reason(clone(honest.log), honest.trusted, { ...honest.claim, kills: honest.claim.kills + 500 })).toBe('claim_mismatch');
    expect(await reason(clone(honest.log), honest.trusted, { ...honest.claim, finalCoins: honest.claim.finalCoins + 1000 })).toBe('claim_mismatch');
    expect(await reason(clone(honest.log), honest.trusted, { ...honest.claim, victory: true })).toBe('claim_mismatch');
  });

  it('a log recorded with another seed than the one the server issued', async () => {
    expect(await reason(clone(honest.log), { ...honest.trusted, seed: honest.trusted.seed + 1 })).toBe('setup_mismatch');
    const forged = { ...clone(honest.log), seed: honest.log.seed + 1 };
    expect(await reason(forged)).toBe('setup_mismatch');
  });

  it('a better loadout or class than the server issued', async () => {
    const rich = { ...clone(honest.log), loadout: { ...honest.log.loadout, revival: 9 } };
    expect(await reason(rich)).toBe('setup_mismatch');
    expect(await reason({ ...clone(honest.log), classId: 'berserker' })).toBe('setup_mismatch');
    expect(await reason({ ...clone(honest.log), doubleTime: true })).toBe('setup_mismatch');
  });

  it('a truncated log (fewer steps than the run took) cannot claim the death', async () => {
    const log = clone(honest.log);
    log.steps = Math.floor(log.steps / 2);
    log.ev = log.ev.slice(0, 0); // and no events at all
    const r = await reason(log);
    expect(['end_mismatch', 'claim_mismatch', 'stalled']).toContain(r);
  });

  it('a padded log (more steps than the run lasted)', async () => {
    const log = clone(honest.log);
    log.steps += 600;
    expect(await reason(log)).toBe('step_mismatch');
  });

  it('events past the end of the run, or out of order', async () => {
    const late = clone(honest.log);
    late.ev.push(10_000, SEV_INPUT, 0, 0, 1);
    expect(await reason(late)).toBe('invalid_log');
    const junk = clone(honest.log);
    junk.ev = [...junk.ev, 5, 99];
    expect(await reason(junk)).toBe('invalid_log');
  });

  it('a pick the game would not have offered', async () => {
    const log = clone(honest.log);
    // First pick event: choose index 7 (there are 3-4 choices at most).
    let i = 0;
    while (i < log.ev.length) {
      const type = log.ev[i + 1];
      if (type === SEV_PICK) {
        log.ev[i + 2] = 7;
        break;
      }
      i += type === SEV_INPUT ? 5 : type === 2 ? 2 : type === 3 ? 3 : type === 4 ? 4 : 3;
    }
    expect(await reason(log)).toBe('illegal_event');
  });

  it('fast-forwarded time: more sim than the server saw wall clock for', async () => {
    const fast = { ...honest.trusted, wallMs: 5_000 };
    expect(await reason(clone(honest.log), fast)).toBe('too_long_for_wall_clock');
  });

  it('a log with no picks logged cannot get past the level-up picker', async () => {
    const log = clone(honest.log);
    const kept: number[] = [];
    let i = 0;
    let carry = 0;
    while (i < log.ev.length) {
      const type = log.ev[i + 1];
      const len = type === SEV_INPUT ? 5 : type === 2 ? 2 : type === 3 ? 3 : type === 4 ? 4 : 3;
      if (type === SEV_PICK) carry += log.ev[i];
      else {
        kept.push(log.ev[i] + carry, ...log.ev.slice(i + 1, i + len));
        carry = 0;
      }
      i += len;
    }
    log.ev = kept;
    expect(await reason(log)).toBe('stalled');
  });

  it('garbage is invalid_log, never a throw', async () => {
    for (const bad of [null, 'x', 7, {}, { v: 1 }, { ...clone(honest.log), ev: 'no' }, { ...clone(honest.log), steps: -4 }]) {
      const out = await verifySoloRun(honest.trusted, bad, honest.claim);
      expect(out.ok).toBe(false);
    }
  });
});

describe('the replay deadline', () => {
  it('stops a replay that runs over its budget', async () => {
    let t = 0;
    const out = await replaySoloRun(clone(honest.log), { timeoutMs: 1, chunkSteps: 50, now: () => (t += 5) });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('timeout');
  });
});

describe('loadout derivation', () => {
  it('reads the upgrade ids the game has always read', () => {
    expect(loadoutFromUpgrades({ reroll: 2, banish: 1, revival: 1, extra_choice: 1, catalyst_affinity: 3, greed: 4 })).toEqual({
      rerolls: 2,
      banishes: 1,
      revival: 1,
      extraChoice: true,
      catalystAffinity: 3,
      greed: 4,
    });
    expect(loadoutFromUpgrades(null)).toEqual({ rerolls: 0, banishes: 0, revival: 0, extraChoice: false, catalystAffinity: 0, greed: 0 });
  });
});
