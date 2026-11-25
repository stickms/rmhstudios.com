/**
 * The party summary: its numbers are the rules engines' own for a fixture of each system, and it carries nothing but
 * those numbers and the data set's names (no free text from the sheet apart from the character's name).
 */
import { describe, expect, it } from 'vitest';
import { DND5E_DATA } from '../dnd5e/data/index';
import { PF2E_DATA } from '../pf2e/data/index';
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import { newDnd5e, newPf2e } from '../factory';
import { partySummary } from '../party-summary';
import type { Dnd5eCharacter, Pf2eCharacter } from '../types';

const PORTRAIT = 'data:image/png;base64,AAAA';

function fighter(): Dnd5eCharacter {
  return {
    ...newDnd5e(),
    name: 'Ilsa',
    playerName: 'A Real Person',
    portrait: PORTRAIT,
    appearance: 'Tall, scarred',
    personality: 'Wry',
    backstory: 'Raised by wolves.',
    notes: 'The secret door is behind the throne.',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hpRolls: [null, null] }],
    skills: ['perception'],
    originFeats: ['alert'],
    hp: { current: 17, temp: 4 },
    conditions: ['Prone', 'Cursed by my GM, secretly'],
    inventory: [{ id: 'i1', name: 'Ring of Secret Wealth', quantity: 1, equipped: true }],
    currency: { pp: 0, gp: 912, ep: 0, sp: 0, cp: 0 },
  };
}

function rogue(): Pf2eCharacter {
  return {
    ...newPf2e(),
    name: 'Tamsin',
    notes: 'private note',
    ancestryId: 'human',
    classId: 'fighter',
    level: 3,
    hp: { current: 20, temp: 0 },
    conditions: ['Frightened', 'a free text entry'],
  };
}

describe('partySummary (D&D 5e)', () => {
  const c = fighter();
  const s = partySummary(c, DND5E_DATA);

  it('equals the rules engine for the fixture', () => {
    const perception = d5.skillLines(c, DND5E_DATA).find((x) => x.id === 'perception')?.bonus ?? 0;
    expect(s).toMatchObject({
      system: 'dnd5e',
      name: 'Ilsa',
      level: 3,
      ancestry: 'Human',
      classes: [{ name: 'Fighter', level: 3 }],
      ac: d5.armorClass(c, DND5E_DATA).value,
      hp: { current: 17, max: d5.maxHp(c, DND5E_DATA), temp: 4 },
      perception: 10 + perception,
      speed: d5.speed(c, DND5E_DATA),
      initiative: d5.initiative(c, DND5E_DATA),
    });
  });

  it('keeps only the system’s own conditions', () => {
    expect(s.conditions).toEqual(['Prone']);
  });

  it('carries no portrait, notes, player name, backstory, inventory or money', () => {
    const json = JSON.stringify(s);
    for (const secret of [
      PORTRAIT,
      'secret door',
      'A Real Person',
      'wolves',
      'Ring of Secret Wealth',
      '912',
      'scarred',
      'Wry',
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(Object.keys(s).sort()).toEqual(
      [
        'ac',
        'ancestry',
        'classes',
        'conditions',
        'hp',
        'initiative',
        'level',
        'name',
        'perception',
        'speed',
        'system',
      ].sort(),
    );
  });
});

describe('partySummary (Pathfinder 2e)', () => {
  const c = rogue();
  const s = partySummary(c, PF2E_DATA);

  it('equals the rules engine for the fixture', () => {
    const per = p2.perception(c, PF2E_DATA).bonus;
    expect(s).toMatchObject({
      system: 'pf2e',
      name: 'Tamsin',
      level: 3,
      ancestry: 'Human',
      classes: [{ name: 'Fighter', level: 3 }],
      ac: p2.armorClass(c, PF2E_DATA).value,
      hp: { current: 20, max: p2.maxHp(c, PF2E_DATA), temp: 0 },
      perception: per,
      speed: p2.speed(c, PF2E_DATA),
      // PF2e initiative is Perception by default.
      initiative: per,
    });
  });

  it('keeps only the system’s own conditions and no private text', () => {
    expect(s.conditions).toEqual(['Frightened']);
    expect(JSON.stringify(s)).not.toContain('private note');
  });
});

describe('partySummary (empty sheets)', () => {
  it('names nothing the data set does not know', () => {
    const s = partySummary(
      { ...newDnd5e(), speciesId: 'made-up', classes: [{ classId: 'nope', level: 2, hpRolls: [null] }] },
      DND5E_DATA,
    );
    expect(s.ancestry).toBeNull();
    expect(s.classes).toEqual([]);
  });
});
