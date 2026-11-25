/**
 * The pure half of table rolls: the modifier a request resolves to is the sheet's own number (`skillLines`, `attacks`,
 * `initiative`, `save`, `perception`, `strikes` with the multiple attack penalty), a request that does not apply to a
 * sheet resolves to nothing, and the visibility and role rules are exactly the ones the feature promises.
 */
import { describe, expect, it } from 'vitest';
import { parseDice } from '@/lib/toolbox/dice';
import { DND5E_DATA } from '../dnd5e/data/index';
import { PF2E_DATA } from '../pf2e/data/index';
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import { newDnd5e, newPf2e } from '../factory';
import {
  damageTextFor,
  exhaustionOf,
  flatOf,
  labelFor,
  modifierFor,
  notationOf,
  parseLabel,
  rollPolicy,
  visibilityWhere,
  visibleTo,
} from '../party-rolls';
import { rollBody } from '../party-rolls-schema';
import type { Dnd5eCharacter, Pf2eCharacter } from '../types';

function fighter(): Dnd5eCharacter {
  return {
    ...newDnd5e(),
    name: 'Ilsa',
    speciesId: 'human',
    backgroundId: 'soldier',
    baseAbilities: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
    classes: [{ classId: 'fighter', level: 5, hpRolls: [null, null, null, null] }],
    skills: ['stealth', 'athletics'],
    expertise: [],
    originFeats: ['alert'],
    exhaustion: 1,
  };
}

function rogue(): Pf2eCharacter {
  return { ...newPf2e(), name: 'Tamsin', ancestryId: 'human', classId: 'fighter', level: 3 };
}

describe('modifierFor (D&D 5e)', () => {
  const c = fighter();
  const d = DND5E_DATA;
  const skill = (id: string) => d5.skillLines(c, d).find((s) => s.id === id)!.bonus;

  it('is the skill line of the sheet', () => {
    expect(modifierFor(c, { kind: 'skill', key: 'stealth' }, d)).toBe(skill('stealth'));
    expect(modifierFor(c, { kind: 'skill', key: 'athletics' }, d)).toBe(skill('athletics'));
    expect(modifierFor(c, { kind: 'skill', key: 'arcana' }, d)).toBe(skill('arcana'));
  });

  it('adds the proficiency bonus to a save only when the class is proficient in it', () => {
    const scores = d5.abilityScores(c, d);
    const pb = d5.proficiencyBonus(d5.totalLevel(c));
    const proficient = d5.saveProficiencies(c, d);
    expect(proficient.length).toBeGreaterThan(0);
    for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      expect(modifierFor(c, { kind: 'save', ability: a }, d)).toBe(
        d5.abilityMod(scores[a]) + (proficient.includes(a) ? pb : 0),
      );
    }
    expect(modifierFor(c, { kind: 'check', ability: 'dex' }, d)).toBe(d5.abilityMod(scores.dex));
  });

  it('is the attack bonus and the initiative bonus of the sheet', () => {
    const lines = d5.attacks(c, d);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((a, i) => expect(modifierFor(c, { kind: 'attack', index: i }, d)).toBe(a.toHit));
    expect(modifierFor(c, { kind: 'initiative' }, d)).toBe(d5.initiative(c, d));
  });

  it('reads the damage text the sheet lists, and nothing for a position past the list', () => {
    const lines = d5.attacks(c, d);
    expect(damageTextFor(c, { kind: 'damage', index: 0, critical: false }, d)).toBe(lines[0]!.damage);
    expect(damageTextFor(c, { kind: 'damage', index: 49, critical: true }, d)).toBeNull();
    expect(modifierFor(c, { kind: 'attack', index: 49 }, d)).toBeNull();
  });

  it('refuses what a 5e sheet does not have: a skill it lacks, a Strike, a Pathfinder save', () => {
    expect(modifierFor(c, { kind: 'skill', key: 'no-such-skill' }, d)).toBeNull();
    expect(modifierFor(c, { kind: 'strike', index: 0, map: 1 }, d)).toBeNull();
    expect(modifierFor(c, { kind: 'save', ability: 'will' }, d)).toBeNull();
  });

  it('reads exhaustion off the sheet (a separate term, not part of the modifier)', () => {
    expect(exhaustionOf(c)).toBe(1);
    expect(exhaustionOf({ ...c, exhaustion: 0 })).toBe(0);
  });
});

describe('modifierFor (Pathfinder 2e)', () => {
  const c = rogue();
  const d = PF2E_DATA;

  it('is Perception, and initiative is Perception', () => {
    const per = p2.perception(c, d).bonus;
    expect(modifierFor(c, { kind: 'perception' }, d)).toBe(per);
    expect(modifierFor(c, { kind: 'initiative' }, d)).toBe(per);
  });

  it('is the skill line, the saving throw and the attribute check of the sheet', () => {
    const line = p2.skillLines(c, d).find((s) => s.id === 'acrobatics')!;
    expect(modifierFor(c, { kind: 'skill', key: 'acrobatics' }, d)).toBe(line.bonus);
    for (const k of ['fortitude', 'reflex', 'will'] as const)
      expect(modifierFor(c, { kind: 'save', ability: k }, d)).toBe(p2.save(c, d, k).bonus);
    expect(modifierFor(c, { kind: 'check', ability: 'str' }, d)).toBe(p2.attributeMods(c).str);
  });

  it('is each attack of a Strike with its multiple attack penalty', () => {
    const lines = p2.strikes(c, d);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((s, i) => {
      for (const map of [0, 1, 2] as const)
        expect(modifierFor(c, { kind: 'strike', index: i, map }, d)).toBe(s.attack[map]);
      // The penalty is real: every later attack is lower than the first.
      expect(s.attack[1]).toBeLessThan(s.attack[0]);
      expect(s.attack[2]).toBeLessThan(s.attack[1]);
    });
    expect(damageTextFor(c, { kind: 'damage', index: 0, critical: true }, d)).toBe(lines[0]!.damage);
  });

  it('refuses a 5e-only ability save and an index past the list', () => {
    expect(modifierFor(c, { kind: 'strike', index: 49, map: 0 }, d)).toBeNull();
    expect(modifierFor(c, { kind: 'attack', index: 0 }, d)).toBeNull();
    expect(exhaustionOf(c)).toBe(0);
  });
});

describe('labels and notation', () => {
  it('stores a rules key, never free text', () => {
    expect(labelFor({ kind: 'skill', key: 'stealth' })).toBe('stealth');
    expect(labelFor({ kind: 'skill', key: 'Dragon Husbandry <b>' })).toBe('lore');
    expect(labelFor({ kind: 'save', ability: 'dex' })).toBe('dex');
    expect(labelFor({ kind: 'strike', index: 1, map: 2 })).toBe('s1m2');
    expect(labelFor({ kind: 'damage', index: 0, critical: true })).toBe('d0c');
    expect(labelFor({ kind: 'free', notation: '3d6+2' })).toBe('');
  });

  it('reads an attack, damage or Strike label back', () => {
    expect(parseLabel('a3')).toEqual({ index: 3, critical: false, map: 0 });
    expect(parseLabel('d1c')).toEqual({ index: 1, critical: true, map: 0 });
    expect(parseLabel('s2m1')).toEqual({ index: 2, critical: false, map: 1 });
    expect(parseLabel('stealth')).toBeNull();
  });

  it('writes the terms of a roll as notation and sums the flat part', () => {
    const p = parseDice('2d20kh1+5-2');
    if (!p.ok) throw new Error('parse');
    expect(notationOf(p.terms)).toBe('2d20kh1+5-2');
    expect(flatOf(p.terms)).toBe(3);
    expect(notationOf(p.terms, 2)).toBe('(2d20kh1+5-2)x2');
    expect(notationOf(p.terms).length).toBeLessThanOrEqual(64);
  });
});

describe('who sees a roll', () => {
  const roll = (visibility: string, userId = 'p1') => ({ visibility, userId });
  const gm = { userId: 'gm', isGm: true };
  const me = { userId: 'p1', isGm: false };
  const other = { userId: 'p2', isGm: false };

  it('shows `table` to everyone, `gm` to the roller and the game master, `secret` to the game master only', () => {
    expect([gm, me, other].map((v) => visibleTo(roll('table'), v))).toEqual([true, true, true]);
    expect([gm, me, other].map((v) => visibleTo(roll('gm'), v))).toEqual([true, true, false]);
    expect([gm, me, other].map((v) => visibleTo(roll('secret', 'gm'), v))).toEqual([true, false, false]);
  });

  it('is a query filter that never mentions `secret` for a player', () => {
    expect(visibilityWhere(gm)).toEqual({});
    const w = visibilityWhere(me);
    expect(JSON.stringify(w)).not.toContain('secret');
    expect(w).toEqual({ OR: [{ visibility: 'table' }, { visibility: 'gm', userId: 'p1' }] });
  });
});

describe('rollPolicy', () => {
  const skill = { kind: 'skill', key: 'stealth' } as const;
  const free = { kind: 'free', notation: '1d20' } as const;
  const base = { isGm: false, hasSeat: true, system: 'pf2e' as const, req: skill, visibility: 'table' as const };

  it('lets a player choose the table or the game master, never secret', () => {
    expect(rollPolicy({ ...base, dc: undefined })).toBeNull();
    expect(rollPolicy({ ...base, visibility: 'gm', dc: undefined })).toBeNull();
    expect(rollPolicy({ ...base, visibility: 'secret', dc: undefined })).toBe('INVALID_INPUT');
  });

  it('lets the game master choose the table or secret, never `gm`', () => {
    const g = { ...base, isGm: true, hasSeat: false, req: free };
    expect(rollPolicy({ ...g, dc: undefined })).toBeNull();
    expect(rollPolicy({ ...g, visibility: 'secret', dc: undefined })).toBeNull();
    expect(rollPolicy({ ...g, visibility: 'gm', dc: undefined })).toBe('INVALID_INPUT');
  });

  it('lets only the game master set a DC, and only on a secret Pathfinder roll', () => {
    expect(rollPolicy({ ...base, visibility: 'gm', dc: 15 })).toBe('FORBIDDEN');
    expect(rollPolicy({ ...base, dc: 15 })).toBe('FORBIDDEN');
    const g = { ...base, isGm: true, hasSeat: false, req: free };
    expect(rollPolicy({ ...g, visibility: 'secret', dc: 15 })).toBeNull();
    expect(rollPolicy({ ...g, visibility: 'table', dc: 15 })).toBe('INVALID_INPUT');
    expect(rollPolicy({ ...g, visibility: 'secret', system: 'dnd5e', dc: 15 })).toBe('INVALID_INPUT');
  });

  it('needs a seat for a sheet roll but not for free notation', () => {
    expect(rollPolicy({ ...base, hasSeat: false, dc: undefined })).toBe('PARTY_ROLL_NO_CHARACTER');
    expect(rollPolicy({ ...base, hasSeat: false, req: free, dc: undefined })).toBeNull();
  });
});

describe('the request schema', () => {
  const ok = (v: unknown) => rollBody.safeParse(v);

  it('drops a modifier, a die or a total sent with the request', () => {
    const r = ok({
      roll: { kind: 'skill', key: 'stealth', modifier: 99, total: 99, dice: [20] },
      mode: 'normal',
      visibility: 'table',
      modifier: 99,
      total: 99,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(JSON.stringify(r.data)).not.toContain('99');
      expect(Object.keys(r.data.roll).sort()).toEqual(['key', 'kind']);
    }
  });

  it('refuses a request that names nothing to roll, a long notation and an out-of-range index', () => {
    expect(ok({ roll: { kind: 'free', notation: 'x'.repeat(65) }, mode: 'normal', visibility: 'table' }).success).toBe(
      false,
    );
    expect(ok({ roll: { kind: 'attack', index: 50 }, mode: 'normal', visibility: 'table' }).success).toBe(false);
    expect(ok({ roll: { kind: 'strike', index: 0, map: 3 }, mode: 'normal', visibility: 'table' }).success).toBe(false);
    expect(ok({ roll: { kind: 'wish' }, mode: 'normal', visibility: 'table' }).success).toBe(false);
    expect(ok({ roll: { kind: 'initiative' }, mode: 'luck', visibility: 'table' }).success).toBe(false);
  });
});
