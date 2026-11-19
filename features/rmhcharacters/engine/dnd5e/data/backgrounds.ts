import type { Dnd5eBackground } from '../../types';

/** SRD 5.2 backgrounds (2024 rules). Each gives three abilities, an Origin feat, two skills and a tool. */
export const DND5E_BACKGROUNDS: Dnd5eBackground[] = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    abilities: ['int', 'wis', 'cha'],
    featId: 'magic-initiate',
    skills: ['insight', 'religion'],
    tool: 'Calligrapher\'s Supplies',
    equipment: 'Choose A or B: (A) Calligrapher\'s Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP. Magic Initiate uses the Cleric list.',
  },
  {
    id: 'criminal',
    name: 'Criminal',
    abilities: ['dex', 'con', 'int'],
    featId: 'alert',
    skills: ['sleight-of-hand', 'stealth'],
    tool: 'Thieves\' Tools',
    equipment: 'Choose A or B: (A) 2 Daggers, Thieves\' Tools, Crowbar, 2 Pouches, Traveler\'s Clothes, 16 GP; or (B) 50 GP.',
  },
  {
    id: 'sage',
    name: 'Sage',
    abilities: ['con', 'int', 'wis'],
    featId: 'magic-initiate',
    skills: ['arcana', 'history'],
    tool: 'Calligrapher\'s Supplies',
    equipment: 'Choose A or B: (A) Quarterstaff, Calligrapher\'s Supplies, Book (history), Parchment (8 sheets), Robe, 8 GP; or (B) 50 GP. Magic Initiate uses the Wizard list.',
  },
  {
    id: 'soldier',
    name: 'Soldier',
    abilities: ['str', 'dex', 'con'],
    featId: 'savage-attacker',
    skills: ['athletics', 'intimidation'],
    tool: 'One kind of Gaming Set',
    equipment: 'Choose A or B: (A) Spear, Shortbow, 20 Arrows, Gaming Set, Healer\'s Kit, Quiver, Traveler\'s Clothes, 14 GP; or (B) 50 GP.',
  },
];
