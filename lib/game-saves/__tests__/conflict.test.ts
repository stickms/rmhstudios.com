/**
 * Which save survives.
 *
 * Every assertion here is a way a real player loses a run: a second device that
 * writes an empty save and wins on recency, a prompt that appears on every load
 * because a local mirror is always a few seconds newer, or a genuine divergence
 * that gets resolved silently in favour of whichever side the code happened to
 * check first.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { chooseSave, dominates } from '../conflict';

interface Save {
  at: number;
  lifetime: number;
  playtime: number;
  runs: number;
}

const save = (at: number, lifetime: number, playtime: number, runs = 0): Save => ({
  at,
  lifetime,
  playtime,
  runs,
});

const monotonic = (s: Save) => ({ lifetime: s.lifetime, playtime: s.playtime, runs: s.runs });
const savedAt = (s: Save) => s.at;
const choose = (local: Save | null, cloud: Save | null) =>
  chooseSave({ local, cloud, monotonic, savedAt });

const T = 1_700_000_000_000;

describe('dominates', () => {
  it('reads a missing counter as zero rather than as no constraint', () => {
    // A save written by an older build cannot report a counter that build did
    // not have. Skipping the key would let it dominate a save that is ahead on
    // exactly the field it cannot see.
    expect(dominates({ a: 1 }, { a: 1, b: 5 })).toBe(false);
    expect(dominates({ a: 1, b: 5 }, { a: 1 })).toBe(true);
  });

  it('survives a corrupt counter instead of failing to dominate itself', () => {
    // `NaN >= 0` is false, so one poisoned field would make every load a
    // conflict prompt.
    const broken = { a: Number.NaN, b: 3 };
    expect(dominates(broken, broken)).toBe(true);
  });

  it('is true for equal counters', () => {
    expect(dominates({ a: 2, b: 2 }, { a: 2, b: 2 })).toBe(true);
  });
});

describe('choosing between two copies', () => {
  it('has nothing to offer when neither exists', () => {
    expect(choose(null, null)).toEqual({ kind: 'none' });
  });

  it('takes the only one there is', () => {
    expect(choose(save(T, 10, 10), null)).toMatchObject({ kind: 'resolved', origin: 'local' });
    expect(choose(null, save(T, 10, 10))).toMatchObject({ kind: 'resolved', origin: 'cloud' });
  });

  /**
   * The ordinary single-device load, and the one this design exists to keep
   * quiet. The server write is throttled and the teardown beacon is
   * best-effort, so the local copy is *routinely* a few seconds ahead of the
   * account. That is the same run, not a second history.
   */
  it('does not ask when the local copy is simply further along', () => {
    const cloud = save(T, 1_000, 600, 2);
    const local = save(T + 20_000, 1_400, 640, 2);
    expect(choose(local, cloud)).toMatchObject({ kind: 'resolved', origin: 'local' });
  });

  it('does not ask when the account is further along', () => {
    const local = save(T, 1_000, 600, 2);
    const cloud = save(T + 3_600_000, 9_000, 3_000, 3);
    expect(choose(local, cloud)).toMatchObject({ kind: 'resolved', origin: 'cloud' });
  });

  /**
   * The failure "newest wins" ships with: opening the game on a fresh device
   * writes an empty save at t+0, which is newer than every hour you have played.
   */
  it('does not let a brand-new empty save beat a real one on recency alone', () => {
    const fresh = save(T + 86_400_000, 0, 0, 0);
    const real = save(T, 5_000_000, 40_000, 12);

    expect(choose(fresh, real)).toMatchObject({ kind: 'resolved', origin: 'cloud' });
    expect(choose(real, fresh)).toMatchObject({ kind: 'resolved', origin: 'local' });
  });

  /**
   * Two real histories: played on a phone for an hour, then on a laptop that
   * had an older copy and got further on a different axis. Nothing can pick
   * this without destroying a run, so it goes to the player.
   */
  it('asks when each copy is ahead of the other on something', () => {
    const local = save(T + 10_000, 5_000, 2_000, 1);
    const cloud = save(T, 3_000, 9_000, 4);

    const result = choose(local, cloud);
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.local).toBe(local);
      expect(result.cloud).toBe(cloud);
    }
  });

  it('breaks an exact tie on the timestamp, freshest copy first', () => {
    const cloud = save(T, 1_000, 600, 2);
    const local = save(T + 5_000, 1_000, 600, 2);

    expect(choose(local, cloud)).toMatchObject({ kind: 'resolved', origin: 'local' });
    expect(choose(save(T - 5_000, 1_000, 600, 2), cloud)).toMatchObject({
      kind: 'resolved',
      origin: 'cloud',
    });
  });

  it('never reports a conflict between a save and itself', () => {
    const one = save(T, 1_234, 567, 8);
    expect(choose(one, { ...one })).toMatchObject({ kind: 'resolved' });
  });
});
