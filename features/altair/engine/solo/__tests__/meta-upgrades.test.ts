// Purchased meta upgrades must actually change a single-player run, and the server's replay must apply
// exactly the same upgrades the server issued. Before the fix every id below was looked up without its
// 'meta_' prefix, so the loadout was always zero and the stat upgrades never reached the sim.
import { describe, it, expect, vi } from 'vitest';
import { META_UPGRADES } from '../../data/meta-upgrades';
import { finalCoinsFor, loadoutFromUpgrades, FIRST_CLEAR_BONUS } from '../loadout';
import { SoloRun } from '../solo-run';
import { checkLoadout, checkSoloLog, type SoloLoadout } from '../solo-log';
import { verifySoloRun, replaySoloRun, canonicalLoadout } from '../verify-solo';
import { useAltairGameStore } from '../../stores/game-store';
import { playSoloRun } from './fixture';

vi.setConfig({ testTimeout: 180_000 });

const ZERO: SoloLoadout = { rerolls: 0, banishes: 0, revival: 0, extraChoice: false, catalystAffinity: 0, greed: 0 };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('loadoutFromUpgrades reads the real upgrade ids', () => {
  it('maps every loadout upgrade by the id the shop sells', () => {
    const l = loadoutFromUpgrades({
      meta_reroll: 3,
      meta_banish: 2,
      meta_revival: 1,
      meta_extra_choice: 1,
      meta_catalyst_affinity: 2,
      meta_greed: 4,
    });
    expect(l).toMatchObject({ rerolls: 3, banishes: 2, revival: 1, extraChoice: true, catalystAffinity: 2, greed: 4 });
  });

  it('the ids it reads exist in the shop (a typo here is how this bug happened)', () => {
    const ids = new Set(META_UPGRADES.map((u) => u.id));
    const everything = Object.fromEntries([...ids].map((id) => [id, 1]));
    const l = loadoutFromUpgrades(everything);
    expect(l.rerolls).toBe(1);
    expect(l.banishes).toBe(1);
    expect(l.revival).toBe(1);
    expect(l.extraChoice).toBe(true);
    expect(l.catalystAffinity).toBe(1);
    expect(l.greed).toBe(1);
    // and the pre-fix ids buy nothing
    expect(loadoutFromUpgrades({ reroll: 3, greed: 5, banish: 3, revival: 2, extra_choice: 1, catalyst_affinity: 2 })).toEqual(ZERO);
  });

  it('sums the stat upgrades per level and ignores levels above the shop maximum', () => {
    const l = loadoutFromUpgrades({ meta_max_hp: 5, meta_hp_regen: 2, meta_might: 99, meta_armor: 3, meta_piercing: 1 });
    expect(l.stats).toEqual({ maxHpPercent: 50, hpRegen: 0.6, mightPercent: 20, armor: 3, pierce: 1 });
  });

  it('a player with no upgrades keeps the exact legacy loadout shape (no stats key)', () => {
    expect(loadoutFromUpgrades(null)).toEqual(ZERO);
    expect(loadoutFromUpgrades({})).toEqual(ZERO);
    expect('stats' in loadoutFromUpgrades({})).toBe(false);
  });
});

describe('a purchased upgrade changes the sim', () => {
  const start = (loadout: SoloLoadout) =>
    new SoloRun({ setup: { seed: 1234, classId: 'knight', doubleTime: false, loadout }, viewport: { w: 1280, h: 720 } });

  it('Reroll / Banish / Revival raise the starting counters', () => {
    start(ZERO);
    const base = useAltairGameStore.getState();
    const [r0, b0, v0] = [base.rerollsRemaining, base.banishesRemaining, base.revivalsRemaining];
    start(loadoutFromUpgrades({ meta_reroll: 2, meta_banish: 3, meta_revival: 1 }));
    const s = useAltairGameStore.getState();
    expect(s.rerollsRemaining).toBe(r0 + 2);
    expect(s.banishesRemaining).toBe(b0 + 3);
    expect(s.revivalsRemaining).toBe(v0 + 1);
  });

  it('Vitality (+10% max HP per level) raises the player max HP, other upgrades leave it alone', () => {
    const hpAfterFirstStep = (loadout: SoloLoadout) => {
      const run = start(loadout);
      run.step();
      return run.world.player.maxHp;
    };
    const base = hpAfterFirstStep(ZERO);
    const vit = hpAfterFirstStep(loadoutFromUpgrades({ meta_max_hp: 5 }));
    expect(vit).toBeGreaterThan(base);
    expect(vit).toBe(Math.floor(base * 1.5));
    expect(hpAfterFirstStep(loadoutFromUpgrades({ meta_reroll: 3 }))).toBe(base);
  });

  it('Swiftness moves the player faster over the same inputs', () => {
    const distance = (loadout: SoloLoadout) => {
      const run = start(loadout);
      run.setInput(0, 0, 8); // right
      for (let i = 0; i < 120; i++) run.step();
      return run.world.player.x;
    };
    expect(distance(loadoutFromUpgrades({ meta_move_speed: 5 }))).toBeGreaterThan(distance(ZERO));
  });

  it('Greed raises the payout of the same run (and the arithmetic matches the shop: +10% per level)', () => {
    expect(finalCoinsFor(1000, 0, false)).toBe(1000);
    expect(finalCoinsFor(1000, 5, false)).toBe(1500);
    const plain = playSoloRun({ loadout: ZERO, walkSteps: 600, maxSteps: 1200 });
    const greedy = playSoloRun({ loadout: loadoutFromUpgrades({ meta_greed: 3 }), walkSteps: 600, maxSteps: 1200 });
    expect(greedy.result.runCoins).toBe(plain.result.runCoins);
    expect(greedy.result.finalCoins).toBe(finalCoinsFor(plain.result.runCoins, 3, false));
  });

  it('the same seed and inputs play differently with and without upgrades', () => {
    const plain = playSoloRun({ loadout: ZERO, walkSteps: 900, maxSteps: 1500 });
    const stacked = playSoloRun({
      loadout: loadoutFromUpgrades({ meta_max_hp: 5, meta_might: 5, meta_move_speed: 5, meta_haste: 5, meta_armor: 3 }),
      walkSteps: 900,
      maxSteps: 1500,
    });
    expect(JSON.stringify(stacked.result)).not.toEqual(JSON.stringify(plain.result));
  });
});

describe('the server replays exactly the upgrades it issued', () => {
  const loadout = loadoutFromUpgrades({ meta_max_hp: 3, meta_might: 2, meta_reroll: 1, meta_greed: 2, meta_pickup_range: 4 });

  it('an honest run with upgrades replays to identical numbers', async () => {
    const rec = playSoloRun({ loadout, walkSteps: 900, maxSteps: 1500 });
    expect(rec.log.loadout.stats).toBeDefined();
    const out = await verifySoloRun(rec.trusted, clone(rec.log), rec.claim);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.verified).toEqual(rec.result);
  });

  it('a log that claims upgrades the server did not issue is refused', async () => {
    const rec = playSoloRun({ loadout, walkSteps: 900, maxSteps: 1500 });
    const issuedNothing = { ...rec.trusted, loadout: ZERO };
    const out = await verifySoloRun(issuedNothing, clone(rec.log), rec.claim);
    expect(out).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('a log that inflates one stat, or drops one, is refused', async () => {
    const rec = playSoloRun({ loadout, walkSteps: 900, maxSteps: 1500 });
    const inflated = clone(rec.log);
    inflated.loadout.stats!.mightPercent += 1;
    expect(await verifySoloRun(rec.trusted, inflated, rec.claim)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
    const dropped = clone(rec.log);
    delete dropped.loadout.stats;
    expect(await verifySoloRun(rec.trusted, dropped, rec.claim)).toMatchObject({ ok: false, reason: 'setup_mismatch' });
  });

  it('stats may only use the whitelisted keys, with sane numbers', () => {
    expect(checkLoadout({ ...ZERO, stats: { mightPercent: 8 } })).toBe(true);
    expect(checkLoadout({ ...ZERO, stats: { revival: 5 } })).toBe(false);
    expect(checkLoadout({ ...ZERO, stats: { projCount: 9 } })).toBe(false);
    expect(checkLoadout({ ...ZERO, stats: { mightPercent: Infinity } })).toBe(false);
    expect(checkLoadout({ ...ZERO, stats: { mightPercent: -1 } })).toBe(false);
    expect(checkLoadout({ ...ZERO, stats: [] })).toBe(false);
    expect(checkLoadout({ ...ZERO, stats: null })).toBe(false);
  });

  it('key order does not matter to the comparison', () => {
    const a = { ...ZERO, stats: { mightPercent: 4, armor: 1 } };
    const b = { ...ZERO, stats: { armor: 1, mightPercent: 4 } };
    expect(JSON.stringify(canonicalLoadout(a))).toBe(JSON.stringify(canonicalLoadout(b)));
  });
});

describe('legacy logs (recorded before the fix) still verify', () => {
  it('a zero-loadout log without stats replays as it always did, and equals the same run with no stats key', async () => {
    const rec = playSoloRun({ loadout: ZERO, walkSteps: 900, maxSteps: 1500 });
    expect('stats' in rec.log.loadout).toBe(false);
    expect(checkSoloLog(rec.log).ok).toBe(true);
    const out = await replaySoloRun(clone(rec.log));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toEqual(rec.result);
    // an empty stats object is the same run as none at all
    const withEmpty = clone(rec.log);
    withEmpty.loadout.stats = {};
    const again = await replaySoloRun(withEmpty);
    expect(again.ok && again.result).toEqual(rec.result);
  });

  it('FIRST_CLEAR_BONUS is the amount the old client promised', () => {
    expect(FIRST_CLEAR_BONUS).toBe(200);
  });
});
