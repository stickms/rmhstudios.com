/**
 * Slice It — modifier pools and the R1 backfill.
 *
 * Two things are being pinned here, and the second is the reason the file
 * exists at all.
 *
 * **The mapping.** `poolOf` decides which board a run lands on. Getting it wrong
 * is not a crash — it is a run quietly ranked against runs it is not comparable
 * to, which is the exact defect R1 set out to fix, reintroduced one function
 * lower down.
 *
 * **The backfill.** `poolOfStoredRow` / `difficultyOfStoredRow` are the
 * TypeScript mirror of the `CASE` expression in
 * `prisma/migrations/20260806160500_slice_it_leaderboard_rekey/migration.sql`.
 * That SQL runs exactly once, against a database this repo's test suite does not
 * have, and if it is wrong every historical row lands on the wrong board with no
 * way to tell after the fact. Testing the mirror is not testing the SQL — the
 * two are kept in step by hand — but it is the difference between "the rule was
 * thought through" and "the rule was typed".
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_MODIFIERS } from '../modifiers';
import {
  CHALLENGE_MODIFIERS,
  MOD_POOLS,
  difficultyOfStoredRow,
  isModPool,
  poolOf,
  poolOfStoredRow,
  toModPool,
} from '../pools';
import type { Modifiers } from '../types';

const mods = (overrides: Partial<Modifiers> = {}): Modifiers => ({
  ...DEFAULT_MODIFIERS,
  ...overrides,
});

describe('poolOf', () => {
  it('puts a clean run at default speed in `none`', () => {
    expect(poolOf(mods())).toBe('none');
  });

  it('puts every visual / window modifier in `challenge`', () => {
    for (const key of CHALLENGE_MODIFIERS) {
      expect(poolOf(mods({ [key]: true }))).toBe('challenge');
    }
  });

  it('puts speed alone in `standard`', () => {
    expect(poolOf(mods({ speed: 1.5 }))).toBe('standard');
    expect(poolOf(mods({ speed: 0.5 }))).toBe('standard');
  });

  it('puts the risk gauges in `standard`, not `challenge`', () => {
    // Neither reveals a note, moves a note or widens a window — all they can do
    // is end the run early. A player who ticks the gauge for its bonus should
    // still appear on the board they actually play on.
    expect(poolOf(mods({ healthGauge: true }))).toBe('standard');
    expect(poolOf(mods({ suddenDeath: true }))).toBe('standard');
  });

  it('lets one challenge modifier outrank any number of standard ones', () => {
    expect(poolOf(mods({ speed: 2, suddenDeath: true, invisible: true }))).toBe('challenge');
  });

  it('ignores difficulty, which is its own board dimension', () => {
    // An `expert` run is never compared with a `normal` one no matter which
    // pool both land in, so the tier must not also move the pool.
    for (const difficulty of ['easy', 'normal', 'hard', 'expert'] as const) {
      expect(poolOf(mods({ difficulty }))).toBe('none');
    }
  });

  it('treats a missing or null modifier set as `none`', () => {
    expect(poolOf(null)).toBe('none');
    expect(poolOf(undefined)).toBe('none');
    expect(poolOf({})).toBe('none');
  });

  it('does not inherit an active modifier from a partial blob', () => {
    // A row stored before a flag existed omits the key entirely. Filling the gap
    // from anything other than "off" would retroactively move old rows onto a
    // board they were never played on.
    expect(poolOf({ speed: 1 })).toBe('none');
    expect(poolOf({ difficulty: 'expert' })).toBe('none');
  });
});

describe('poolOfStoredRow — the migration backfill mirror', () => {
  it('agrees with poolOf whenever speedMod agrees with the blob', () => {
    const cases: Partial<Modifiers>[] = [
      {},
      { speed: 1 },
      { speed: 1.5 },
      { invisible: true },
      { bombs: true, speed: 2 },
      { healthGauge: true },
      { suddenDeath: true },
      { strictTiming: true, difficulty: 'expert' },
    ];
    for (const modifiers of cases) {
      const speedMod = modifiers.speed ?? 1;
      expect(poolOfStoredRow({ modifiers, speedMod })).toBe(poolOf(modifiers));
    }
  });

  it('reads the speedMod column when the blob has no speed', () => {
    // Legacy rows exist whose `modifiers` JSON predates the `speed` key while
    // the column beside it recorded the real rate. The column is the server's
    // own clamped value and is the more trustworthy of the two.
    expect(poolOfStoredRow({ modifiers: {}, speedMod: 1.5 })).toBe('standard');
    expect(poolOfStoredRow({ modifiers: null, speedMod: 2 })).toBe('standard');
  });

  it('reads the blob when the speedMod column is absent', () => {
    expect(poolOfStoredRow({ modifiers: { speed: 1.5 } })).toBe('standard');
    expect(poolOfStoredRow({ modifiers: { speed: 1.5 }, speedMod: null })).toBe('standard');
  });

  it('still says `challenge` when a challenge modifier rides along with speed', () => {
    expect(poolOfStoredRow({ modifiers: { spin: true }, speedMod: 1.5 })).toBe('challenge');
  });

  it('says `none` for a row with no modifiers at all', () => {
    expect(poolOfStoredRow({ modifiers: null })).toBe('none');
    expect(poolOfStoredRow({ modifiers: null, speedMod: 1 })).toBe('none');
  });

  it('only ever produces a pool the column can hold', () => {
    const produced = new Set(
      [
        {},
        { speed: 2 },
        { invisible: true },
        { healthGauge: true },
        { difficulty: 'hard' as const },
      ].map((modifiers) => poolOfStoredRow({ modifiers })),
    );
    for (const pool of produced) expect(MOD_POOLS).toContain(pool);
  });
});

/**
 * The two flags that landed after the rekey migration's `CASE` was written, and
 * the SQL that had to be taught about them.
 *
 * `perfectionist` (M6) and `lenientTiming` (A9) are both optional on
 * `Modifiers`, so `poolOfStoredRow` had to name each one explicitly — it is a
 * hand-written mirror, not something derived from `activeModifierKeys` the way
 * `poolOf` is. The migration `CASE` is a third copy of the same rule, in a
 * language nothing here can execute, so the assertions below read the SQL as
 * text. That is not a test of the migration; it is the tripwire on
 * "change one, change the other".
 */
describe('the modifiers that landed after the backfill was written', () => {
  it('sorts a lenient-window run into `challenge`, live and stored', () => {
    // A widened window is the same kind of incomparable as a narrowed one, and
    // `strictTiming` has always been `challenge` for exactly that reason.
    expect(poolOf(mods({ lenientTiming: true }))).toBe('challenge');
    expect(poolOfStoredRow({ modifiers: { lenientTiming: true } })).toBe('challenge');
    expect(poolOfStoredRow({ modifiers: { lenientTiming: true }, speedMod: 1.5 })).toBe(
      'challenge',
    );
  });

  it('sorts a perfect-or-die run into `standard`, live and stored', () => {
    // All it can do is end the run early — it never reveals, moves or re-times
    // a note — so it sits beside `suddenDeath`, not beside `invisible`.
    expect(poolOf(mods({ perfectionist: true }))).toBe('standard');
    expect(poolOfStoredRow({ modifiers: { perfectionist: true } })).toBe('standard');
    expect(poolOfStoredRow({ modifiers: { perfectionist: true }, speedMod: 1 })).toBe('standard');
  });

  it('never files either one as a completely clean run', () => {
    // The failure this replaced: a `perfectionist` row backfilled as `none`,
    // mixed with untouched runs despite carrying the largest single-modifier
    // bonus in the game.
    expect(poolOfStoredRow({ modifiers: { perfectionist: true } })).not.toBe('none');
    expect(poolOfStoredRow({ modifiers: { lenientTiming: true } })).not.toBe('none');
  });

  it('has a SQL mirror that knows about both', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260806180000_slice_it_pool_flags_backfill/migration.sql',
      ),
      'utf8',
    );

    // Just the CASE, so the module header's prose cannot satisfy an assertion
    // about the expression.
    const body = sql.slice(sql.indexOf('CASE'), sql.indexOf('END AS "newPool"'));
    const [challengeBranch, afterChallenge] = body.split("THEN 'challenge'");
    const [standardBranch] = afterChallenge.split("THEN 'standard'");

    expect(challengeBranch).toContain("'lenientTiming'");
    expect(standardBranch).toContain("'perfectionist'");
    // …and neither flag in the branch it does not belong to.
    expect(challengeBranch).not.toContain("'perfectionist'");
    expect(standardBranch).not.toContain("'lenientTiming'");
  });
});

describe('difficultyOfStoredRow', () => {
  it('keeps a recognised tier', () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'expert'] as const) {
      expect(difficultyOfStoredRow({ difficulty })).toBe(difficulty);
    }
  });

  it('falls back to `normal` for a missing, null or unrecognised tier', () => {
    // The column is part of a unique key. A typo trusted straight through would
    // mint a board with exactly one row on it, permanently.
    expect(difficultyOfStoredRow({})).toBe('normal');
    expect(difficultyOfStoredRow(null)).toBe('normal');
    expect(difficultyOfStoredRow({ difficulty: 'EXPERT' as never })).toBe('normal');
    expect(difficultyOfStoredRow({ difficulty: '' as never })).toBe('normal');
  });
});

describe('pool narrowing', () => {
  it('accepts the three pools and nothing else', () => {
    for (const pool of MOD_POOLS) expect(isModPool(pool)).toBe(true);
    for (const value of ['', 'NONE', 'hard', null, undefined, 3, {}]) {
      expect(isModPool(value)).toBe(false);
    }
  });

  it('coerces an unknown column value rather than throwing', () => {
    // The column is a VARCHAR. A value written by a version of the game that no
    // longer exists must render as *something*, and a default board is a better
    // answer than a 500 on a read path.
    expect(toModPool('challenge')).toBe('challenge');
    expect(toModPool('nonsense')).toBe('none');
    expect(toModPool(null)).toBe('none');
  });
});
