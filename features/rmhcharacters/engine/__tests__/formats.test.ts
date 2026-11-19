/**
 * Character files are the user's data and the only way it leaves the browser,
 * so these hold the round trips (nothing lost) and the import normaliser
 * (nothing hostile kept), plus the two derived numbers a wrong table would
 * silently break for every caster: multiclass slots and Remaster boosts.
 */
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../dnd5e/data';
import { PF2E_DATA } from '../pf2e/data';
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import { newDnd5e, newPf2e, normalizeCharacter } from '../factory';
import { exportCharacter, importText } from '../formats';
import { importDndBeyond } from '../formats/dndbeyond';
import type { Dnd5eCharacter, Pf2eCharacter } from '../types';

function fighterWizard(): Dnd5eCharacter {
  return {
    ...newDnd5e(),
    name: 'Ilsa',
    speciesId: 'elf',
    backgroundId: 'sage',
    backgroundIncreases: ['int', 'int', 'con'],
    classes: [
      { classId: 'wizard', level: 5, hpRolls: [] },
      { classId: 'cleric', level: 2, hpRolls: [] },
    ],
    hp: { current: 20, temp: 0 },
  };
}

function pfRogue(): Pf2eCharacter {
  const c = newPf2e();
  const ancestry = PF2E_DATA.ancestries[0]!;
  const klass = PF2E_DATA.classes.find((k) => k.id === 'rogue') ?? PF2E_DATA.classes[0]!;
  const bg = PF2E_DATA.backgrounds[0]!;
  return {
    ...c,
    name: 'Vex',
    level: 5,
    ancestryId: ancestry.id,
    heritageId: ancestry.heritages[0]?.id ?? '',
    backgroundId: bg.id,
    classId: klass.id,
    boosts: {
      ...c.boosts,
      ancestry: ancestry.boosts.filter((b): b is Exclude<typeof b, 'free'> => b !== 'free'),
      background: [bg.boosts[0][0]!],
      class: klass.keyAbility[0]!,
      levels: { '1': ['dex', 'con', 'wis', 'cha'], '5': ['dex', 'con', 'int', 'str'] },
    },
    trainedSkills: ['stealth', 'thievery', 'acrobatics'],
    skillIncreases: { '3': 'stealth' },
    feats: [{ slot: 'bonus-1', featId: bg.featId }],
    hp: { current: 30, temp: 0 },
  };
}

describe('rmhcharacters file formats', () => {
  it('round-trips a 5e character through the native format', async () => {
    const c = fighterWizard();
    const file = await exportCharacter(c, 'native');
    const back = await importText(file.body);
    expect(back.characters[0]).toEqual(c);
  });

  it('round-trips both systems through Foundry VTT losslessly', async () => {
    for (const c of [fighterWizard(), pfRogue()]) {
      const file = await exportCharacter(c, 'foundry');
      const back = await importText(file.body);
      expect(back.characters[0]).toEqual(c);
    }
  });

  it('reads a Foundry dnd5e actor without our flag from its items', async () => {
    const file = await exportCharacter(fighterWizard(), 'foundry');
    const actor = JSON.parse(file.body);
    delete actor.flags;
    const back = (await importText(JSON.stringify(actor))).characters[0] as Dnd5eCharacter;
    expect(back.system).toBe('dnd5e');
    expect(back.classes.map((k) => [k.classId, k.level])).toEqual([['wizard', 5], ['cleric', 2]]);
    expect(back.speciesId).toBe('elf');
    expect(d5.abilityScores(back, DND5E_DATA)).toEqual(d5.abilityScores(fighterWizard(), DND5E_DATA));
  });

  it('round-trips the build through Pathbuilder 2e JSON', async () => {
    const c = pfRogue();
    const file = await exportCharacter(c, 'pathbuilder');
    const back = (await importText(file.body)).characters[0] as Pf2eCharacter;
    expect(back.classId).toBe(c.classId);
    expect(back.ancestryId).toBe(c.ancestryId);
    expect(back.level).toBe(5);
    expect(p2.attributeMods(back)).toEqual(p2.attributeMods(c));
    expect(p2.skillRank(back, 'stealth')).toBe(2);
  });

  it('reads D&D Beyond scores with their bonuses applied', () => {
    const c = importDndBeyond(
      {
        data: {
          name: 'Bree',
          stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })),
          bonusStats: [],
          overrideStats: [{ id: 6, value: 18 }],
          classes: [{ level: 3, isStartingClass: true, definition: { name: 'Rogue' } }],
          race: { baseRaceName: 'Halfling', fullName: 'Halfling' },
          modifiers: { background: [{ type: 'bonus', subType: 'dexterity-score', value: 2 }, { type: 'proficiency', subType: 'stealth' }] },
        },
      },
      DND5E_DATA,
    )!;
    expect(c.baseAbilities.dex).toBe(12);
    expect(c.baseAbilities.cha).toBe(18);
    expect(c.classes).toEqual([{ classId: 'rogue', level: 3, hpRolls: [] }]);
    expect(c.skills).toContain('stealth');
  });

  it('refuses unknown JSON and drops anything that is not an image portrait', async () => {
    await expect(importText('{"hello":1}')).rejects.toThrow();
    await expect(importText('not json')).rejects.toThrow();
    const c = normalizeCharacter({ ...fighterWizard(), portrait: 'javascript:alert(1)', name: 'x'.repeat(500) })!;
    expect(c.portrait).toBeUndefined();
    expect(c.name.length).toBe(120);
    expect(normalizeCharacter({ system: 'gurps' })).toBeNull();
  });
});

describe('rmhcharacters derived numbers', () => {
  it('uses the multiclass slot table (wizard 5 + cleric 2 = caster level 7)', () => {
    expect(d5.spellSlots(fighterWizard(), DND5E_DATA)).toEqual([4, 3, 3, 1]);
  });

  it('rounds half-caster levels up (2024) so a paladin 1 has slots', () => {
    const c = { ...newDnd5e(), classes: [{ classId: 'paladin', level: 1, hpRolls: [] }] };
    expect(d5.spellSlots(c, DND5E_DATA)).toEqual([2]);
  });

  it('turns a boost at +4 or more into a partial boost after 1st level', () => {
    const c = pfRogue();
    // dex: background? + class? + level 1 + level 5 — whatever it reaches, it never jumps past +5 at level 5.
    const mods = p2.attributeMods(c);
    for (const v of Object.values(mods)) expect(v).toBeLessThanOrEqual(5);
    const high = { ...c, boosts: { ...c.boosts, background: ['dex' as const], class: 'dex' as const, ancestry: ['dex' as const] } };
    expect(p2.attributeMods(high).dex).toBe(4);
    expect(p2.partialBoosts(high)).toContain('dex');
  });
});
