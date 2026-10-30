/**
 * CS:GO's client pieces that are pure: the buy menu's catalogue (team items, groups, prices,
 * affordability), the HUD state from snapshot records (phase, clocks, the bomb, flash, weapons), and
 * the profile's map and options.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { setCsWeaponData } from '../data/weapon-data';
import { WEAPON_DATA_FIXTURE } from '../data/__fixtures__/weapon-data.fixture';
import { CS_TEAM_CT, CS_TEAM_T, CS_WIN_BOMB_DEFUSED } from '../constants';
import { LIFE_ALIVE } from '../../tf2-game/sim/entity';
import type { NetRecord } from '../../tf2-game/sim/net-schema';
import { buyCatalog } from './buy-catalog';
import { buildCsHud, flashOpacity, FLASH_FADE_SECONDS } from './hud';

beforeAll(() => {
  setCsWeaponData(WEAPON_DATA_FIXTURE);
});

const ctx = (records: Record<string, NetRecord[]>, me: NetRecord | null, now: number, weapons: Array<{ slot: number; record: NetRecord }> = []) => ({
  serverTime: now,
  entities: (type: string) => records[type] ?? [],
  me,
  weapons,
});

describe('the buy menu', () => {
  it("lists each team's own items, grouped and cheapest first, and marks what we can afford", () => {
    const t = buyCatalog(CS_TEAM_T, 2700);
    const ct = buyCatalog(CS_TEAM_CT, 2700);
    const all = (c: ReturnType<typeof buyCatalog>) => Object.values(c).flat().map((e) => e.command);
    // The defuse kit is CT-only; every group is sorted by price.
    expect(all(ct)).toContain('defuser');
    expect(all(t)).not.toContain('defuser');
    for (const group of Object.values(t)) {
      const prices = group.map((e) => e.price);
      if (group !== t.gear) expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
    for (const e of Object.values(t).flat()) expect(e.affordable).toBe(e.price <= 2700);
    // Team-locked weapons: whatever one team gets that the other does not, the data says so.
    expect(all(t).length).toBeGreaterThan(0);
    expect(buyCatalog(0, 16000).pistols).toEqual([]);
  });
});

describe('the HUD state', () => {
  const me: NetRecord = { lifeState: LIFE_ALIVE, money: 800, armor: 100, helmet: true, inBuyZone: true, activeSlot: 1, flashAt: -1000, flashDuration: 0, flashAlpha: 0 };

  it('reads the freeze, the round clock, the buy window and our kit', () => {
    const rules: NetRecord = { mode: 'de', roundNumber: 3, freezeEndsAt: 15, buyEndsAt: 35, roundEndsAt: 130, roundWinner: 0 };
    const frozen = buildCsHud(ctx({ cs_rules: [rules] }, me, 10))!;
    expect(frozen).toMatchObject({ phase: 'freeze', timeLeft: 5, canBuy: true, money: 800, armor: 100, helmet: true, round: 3 });
    const live = buildCsHud(ctx({ cs_rules: [rules] }, me, 40))!;
    expect(live).toMatchObject({ phase: 'live', timeLeft: 90, canBuy: false, buyTimeLeft: 0 });
  });

  it('shows the bomb and who is defusing it, then the round result', () => {
    const rules: NetRecord = { mode: 'de', freezeEndsAt: 0, buyEndsAt: 0, roundEndsAt: 200, bombPlanted: true, roundWinner: 0 };
    const c4: NetRecord = { explodesAt: 100, defuser: 7, defuseEndsAt: 65 };
    const hud = buildCsHud(ctx({ cs_rules: [rules], cs_planted_c4: [c4] }, me, 60))!;
    expect(hud.phase).toBe('planted');
    expect(hud.bomb).toEqual({ timeLeft: 40, defusing: true, defuseLeft: 5 });
    const over = buildCsHud(ctx({ cs_rules: [{ ...rules, roundWinner: CS_TEAM_CT, roundWinReason: CS_WIN_BOMB_DEFUSED }] }, me, 66))!;
    expect(over).toMatchObject({ phase: 'over', roundWinner: CS_TEAM_CT, winReason: CS_WIN_BOMB_DEFUSED, bomb: null });
  });

  it('deathmatch: buying is always open in a buy zone, and the dead count down to respawn', () => {
    const rules: NetRecord = { mode: 'dm', freezeEndsAt: 0, roundEndsAt: 600 };
    expect(buildCsHud(ctx({ cs_rules: [rules] }, me, 300))!.canBuy).toBe(true);
    const dead = buildCsHud(ctx({ cs_rules: [rules] }, { ...me, lifeState: 2, respawnAt: 302 }, 300))!;
    expect(dead.respawnIn).toBe(2);
    expect(dead.canBuy).toBe(false);
  });

  it('a flashbang holds full white, then fades over its last seconds', () => {
    expect(flashOpacity(10, 10, 5, 255)).toBe(1);
    expect(flashOpacity(10 + 5 - FLASH_FADE_SECONDS / 2, 10, 5, 255)).toBeCloseTo(0.5);
    expect(flashOpacity(16, 10, 5, 255)).toBe(0);
    expect(flashOpacity(10, 10, 5, 128)).toBeCloseTo(128 / 255);
  });

  it('nothing before the round state arrives', () => {
    expect(buildCsHud(ctx({}, me, 0))).toBeNull();
  });
});
