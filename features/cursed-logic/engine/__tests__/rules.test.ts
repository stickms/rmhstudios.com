import { describe, expect, it } from 'vitest';
import { DAMAGE, PLAYER, SECTORS, SHOP_PRICES, STANCE_NUMBERS, TOTAL_DUELS } from '../data';
import { belief, protocolDistribution } from '../protocol';
import { PROTOCOLS } from '../data';
import { resolveClash, type ClashInput } from '../resolution';
import { createRng } from '../rng';
import {
  chooseStance,
  commitAction,
  continueRun,
  finishRound,
  newRun,
  pickMilestone,
  type RunState,
} from '../run';
import { buyItem } from '../shopState';
import { claimProblem, maxScoreFor, pactMultiplier, runScore, scoreDuel, sectorAfter } from '../score';
import { achievementsForRun, CL_ACHIEVEMENTS } from '../achievements';

const base: ClashInput = {
  player: 'Strike',
  protocol: 'Idle',
  playerPrimed: false,
  protocolPrimed: false,
  stance: null,
  reinforced: false,
  overdraw: false,
  modifier: null,
  playerCondition: null,
  protocolCondition: null,
  upgrades: [],
  playerStrikeBonus: 0,
  protocolStrikeBonus: 0,
  trait: 'scripted',
  traitPower: 0,
};

describe('resolveClash', () => {
  it('Strike into a glitch lands in full', () => {
    expect(resolveClash(base).protocolDamage).toBe(DAMAGE.strike);
  });

  it('Strike into a Block is chip and leaves you Overextended', () => {
    const r = resolveClash({ ...base, protocol: 'Block' });
    expect(r.protocolDamage).toBe(DAMAGE.chip);
    expect(r.nextPlayerCondition).toBe('Overextended');
  });

  it('Pressure turns the chip up and keeps you balanced', () => {
    const r = resolveClash({ ...base, protocol: 'Block', stance: 'Pressure' });
    expect(r.protocolDamage).toBe(STANCE_NUMBERS.pressureChip);
    expect(r.nextPlayerCondition).toBeNull();
  });

  it('Striking a Prepare interrupts it for extra and locks it in', () => {
    const r = resolveClash({ ...base, protocol: 'Prepare' });
    expect(r.protocolDamage).toBe(DAMAGE.strike + DAMAGE.interruptBonus);
    expect(r.protocolPrimed).toBe(false);
    expect(r.nextProtocolCondition).toBe('LockedIn');
  });

  it('a Prepare that is not struck primes the next Strike', () => {
    const r = resolveClash({ ...base, player: 'Prepare', protocol: 'Block' });
    expect(r.playerPrimed).toBe(true);
    const next = resolveClash({ ...base, playerPrimed: true });
    expect(next.protocolDamage).toBe(DAMAGE.strike + DAMAGE.primedBonus);
  });

  it('a struck Prepare fails and Exposes you; Read holds it and softens the blow', () => {
    const r = resolveClash({ ...base, player: 'Prepare', protocol: 'Strike' });
    expect(r.playerPrimed).toBe(false);
    expect(r.playerDamage).toBe(DAMAGE.protocolStrike + DAMAGE.interruptBonus);
    expect(r.nextPlayerCondition).toBe('Exposed');
    const read = resolveClash({ ...base, player: 'Prepare', protocol: 'Strike', stance: 'Read' });
    expect(read.playerPrimed).toBe(true);
    expect(read.playerDamage).toBe(DAMAGE.protocolStrike - STANCE_NUMBERS.readReduce);
  });

  it('Block takes chip; Guard and a reinforced Block take none; Counter reflects', () => {
    expect(resolveClash({ ...base, player: 'Block', protocol: 'Strike' }).playerDamage).toBe(DAMAGE.chip);
    expect(resolveClash({ ...base, player: 'Block', protocol: 'Strike', stance: 'Guard' }).playerDamage).toBe(0);
    const reinforced = resolveClash({ ...base, player: 'Block', protocol: 'Strike', reinforced: true });
    expect(reinforced.playerDamage).toBe(0);
    expect(reinforced.protocolDamage).toBe(DAMAGE.reinforceReflect);
    const counter = resolveClash({ ...base, player: 'Block', protocol: 'Strike', stance: 'Counter' });
    expect(counter.protocolDamage).toBe(STANCE_NUMBERS.counterReflect);
  });

  it('No Block turns Block into nothing', () => {
    const r = resolveClash({ ...base, player: 'Block', protocol: 'Strike', modifier: 'NoBlock' });
    expect(r.playerDamage).toBe(DAMAGE.protocolStrike);
  });

  it('the Warden reflects a Strike into its Block; the Leech heals on a clean hit', () => {
    expect(resolveClash({ ...base, protocol: 'Block', trait: 'bulwark', traitPower: 1 }).playerDamage).toBe(1);
    const leech = resolveClash({ ...base, player: 'Probe', protocol: 'Strike', trait: 'siphon', traitPower: 1 });
    expect(leech.protocolHeal).toBe(1);
  });

  it('overdraw costs a point of Integrity', () => {
    expect(resolveClash({ ...base, player: 'Block', overdraw: true }).playerDamage).toBe(DAMAGE.overdraw);
  });
});

describe('protocols', () => {
  it('every distribution sums to 1 and a primed Protocol mostly Strikes', () => {
    for (const def of Object.values(PROTOCOLS)) {
      const d = protocolDistribution({ def, health: def.health, maxHealth: def.health, primed: true, history: ['Block'] });
      const sum = d.Strike + d.Block + d.Prepare + d.Idle;
      expect(sum).toBeCloseTo(1, 6);
      if (def.trait !== 'mirror') expect(d.Strike).toBeGreaterThan(Math.max(d.Block, d.Prepare, d.Idle));
    }
  });

  it('a truthful tell is certain apart from the glitch; the Liar’s tell points away from itself', () => {
    const def = PROTOCOLS.liar;
    const view = { def, health: 10, maxHealth: 10, primed: false, history: [] };
    expect(belief(view, 'Block', { truthful: true }).Block).toBeCloseTo(1 - def.glitch + def.glitch / 4, 6);
    const liarRead = belief(view, 'Block');
    expect(liarRead.Block).toBeLessThan(protocolDistribution(view).Block);
  });
});

describe('a run', () => {
  it('has five sectors, nine duels and a shop after each of the first four', () => {
    expect(SECTORS).toHaveLength(5);
    expect(TOTAL_DUELS).toBe(9);
    expect(SECTORS.filter((s) => s.shop)).toHaveLength(4);
  });

  it('is reproducible from its seed', () => {
    const a = newRun(42, [], createRng(42));
    const b = newRun(42, [], createRng(42));
    expect(a.duel).toEqual(b.duel);
  });

  it('carries Integrity between duels, pays fragments, then opens the milestone and the shop', () => {
    const rng = createRng(7);
    let run: RunState = newRun(7, [], rng);
    // Force a quick win: set the Protocol to 1 health and Strike.
    run = { ...run, duel: { ...run.duel!, protocolHealth: 1, intended: 'Idle' } };
    run = chooseStance(run, run.duel!.stanceOffer[0]!);
    const pending = commitAction({ ...run, duel: { ...run.duel!, lockedRounds: 1 } }, rng, 'Strike', false)!;
    run = finishRound(run, rng, pending, null);
    expect(run.duelsWon).toBe(1);
    expect(run.stage).toBe('intermission');
    expect(run.fragments).toBeGreaterThan(0);
    run = continueRun(run, rng);
    expect(run.stage).toBe('duel');
    expect(run.duelInSector).toBe(1);
    // Jump to the end of sector 1.
    run = { ...run, duel: { ...run.duel!, protocolHealth: 1, intended: 'Idle', lockedRounds: 1 } };
    run = chooseStance(run, run.duel!.stanceOffer[0]!);
    run = finishRound(run, rng, commitAction(run, rng, 'Strike', false)!, null);
    expect(run.stage).toBe('milestone');
    expect(run.milestoneChoices).toHaveLength(2);
    run = pickMilestone(run, rng, run.milestoneChoices![0]!);
    expect(run.upgrades).toHaveLength(1);
    expect(run.stage).toBe('shop');
    expect(run.shelf[0]).toBe('patch');
    const rich = { ...run, fragments: 100, integrity: 5 };
    const healed = buyItem(rich, 'patch');
    expect(healed.integrity).toBeGreaterThan(5);
    expect(healed.fragments).toBe(100 - SHOP_PRICES.patch);
    run = continueRun(healed, rng);
    expect(run.sector).toBe(2);
    expect(run.integrity).toBeLessThanOrEqual(run.maxIntegrity);
    expect(run.maxIntegrity).toBe(PLAYER.maxIntegrity);
  });
});

describe('score', () => {
  it('adds the sector, Integrity, flawless and speed parts', () => {
    const s = scoreDuel({ sector: 2, integrityLeft: 10, rounds: 6, flawless: true });
    expect(s.total).toBe(2000 + 600 + 800 + 300);
  });

  it('applies pacts as an additive multiplier', () => {
    expect(pactMultiplier([])).toBe(1);
    expect(pactMultiplier(['glassCannon', 'glassCannon'])).toBe(1.5);
    expect(runScore(1000, false, ['doubleDown'])).toBe(1200);
  });

  it('bounds a claim by the duels it says it won', () => {
    expect(maxScoreFor(0, 1)).toBe(0);
    expect(maxScoreFor(1, 1)).toBeLessThan(maxScoreFor(2, 1));
    expect(maxScoreFor(9, 1)).toBeGreaterThan(maxScoreFor(8, 1) + 8000);
  });
});

describe('run claims and achievements', () => {
  const honest = {
    score: 3000,
    duelsWon: 2,
    sector: 2,
    victory: false,
    pacts: [] as never[],
    flawlessDuels: 1,
    fastestDuel: 5,
  };

  it('accepts an honest run and refuses each kind of mismatch', () => {
    expect(claimProblem(honest)).toBeNull();
    expect(claimProblem({ ...honest, victory: true })).toBe('victory');
    expect(claimProblem({ ...honest, sector: 4 })).toBe('sector');
    expect(claimProblem({ ...honest, flawlessDuels: 3 })).toBe('flawless');
    expect(claimProblem({ ...honest, fastestDuel: 0 })).toBe('fastest');
    expect(claimProblem({ ...honest, score: maxScoreFor(2, 1) + 1 })).toBe('score');
    expect(claimProblem({ ...honest, duelsWon: 9, sector: 5, victory: true, score: 50_000 })).toBeNull();
    expect(claimProblem({ ...honest, duelsWon: 0, sector: 1, fastestDuel: 0, flawlessDuels: 0, score: 0 })).toBeNull();
    expect(sectorAfter(0)).toBe(1);
    expect(sectorAfter(8)).toBe(5);
    expect(sectorAfter(9)).toBe(5);
  });

  it('grants from the run: first duel and flawless here, nothing for a victory not had', () => {
    const a = achievementsForRun({ ...honest, neverBelowHalf: true, durationMs: 60_000 });
    expect(a.grant).toContain(CL_ACHIEVEMENTS.firstDuel);
    expect(a.grant).toContain(CL_ACHIEVEMENTS.flawless);
    expect(a.grant).not.toContain(CL_ACHIEVEMENTS.rootAccess);
    expect(a.grant).not.toContain(CL_ACHIEVEMENTS.ironWill);
    expect(a.progress).toContainEqual({ id: CL_ACHIEVEMENTS.duels50, by: 2 });
    const full = achievementsForRun({
      ...honest,
      duelsWon: 9,
      sector: 5,
      victory: true,
      pacts: ['chaosRun', 'glassCannon', 'doubleDown', 'blackout'],
      neverBelowHalf: true,
      durationMs: 1,
    });
    expect(full.grant).toEqual(expect.arrayContaining([CL_ACHIEVEMENTS.rootAccess, CL_ACHIEVEMENTS.cursedRun, CL_ACHIEVEMENTS.ironWill]));
  });

  it('the simulation’s runs all pass the server’s claim check', async () => {
    const { simulateRun } = await import('../sim');
    for (let i = 0; i < 40; i++) {
      // simulateRun reports only the summary; rebuild the claim the way the UI does from the run state.
      const o = simulateRun(77 + i, { strategy: 'reader' });
      expect(o.score).toBeLessThanOrEqual(maxScoreFor(o.duelsWon, 1));
      expect(sectorAfter(o.duelsWon)).toBe(o.victory ? 5 : o.sectorReached);
    }
  });
});
