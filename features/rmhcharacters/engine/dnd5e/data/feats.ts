import type { Ability, Dnd5eFeat } from '../../types';

/** SRD 5.2 feats (2024 rules): origin, general, fighting style and epic boons. */

const ANY: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const DND5E_FEATS: Dnd5eFeat[] = [
  /* Origin feats */
  {
    id: 'alert',
    name: 'Alert',
    category: 'origin',
    text: 'Add your Proficiency Bonus to Initiative rolls. Right after rolling Initiative, you can swap your result with a willing ally\'s (neither of you Incapacitated).',
  },
  {
    id: 'magic-initiate',
    name: 'Magic Initiate',
    category: 'origin',
    repeatable: true,
    text: 'Choose the Cleric, Druid or Wizard list (the Acolyte takes Cleric, the Sage Wizard). Learn two cantrips and one level 1 spell from it, using Intelligence, Wisdom or Charisma. Cast the level 1 spell once per Long Rest without a slot, or with slots you have. Repeatable with a different list.',
  },
  {
    id: 'savage-attacker',
    name: 'Savage Attacker',
    category: 'origin',
    text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.',
  },
  {
    id: 'skilled',
    name: 'Skilled',
    category: 'origin',
    repeatable: true,
    text: 'Gain proficiency in any combination of three skills or tools. Repeatable.',
  },

  /* General feats */
  {
    id: 'ability-score-improvement',
    name: 'Ability Score Improvement',
    category: 'general',
    prerequisite: 'Level 4+',
    minLevel: 4,
    repeatable: true,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 2, or two ability scores by 1 each, to a maximum of 20. Repeatable.',
  },
  {
    id: 'grappler',
    name: 'Grappler',
    category: 'general',
    prerequisite: 'Level 4+, Strength or Dexterity 13+',
    minLevel: 4,
    prereqAbilities: { str: 13, dex: 13 },
    prereqAny: true,
    abilityIncrease: ['str', 'dex'],
    text: 'Increase Strength or Dexterity by 1. Punch and Grab: once per turn when you hit with an Unarmed Strike as part of the Attack action, use both the Damage and Grapple options. You have Advantage on attacks against a creature you are grappling, and moving a grappled creature your size or smaller costs no extra movement.',
  },

  /* Fighting style feats */
  {
    id: 'archery',
    name: 'Archery',
    category: 'fighting-style',
    prerequisite: 'Fighting Style feature',
    text: 'You gain a +2 bonus to attack rolls you make with Ranged weapons.',
  },
  {
    id: 'defense',
    name: 'Defense',
    category: 'fighting-style',
    prerequisite: 'Fighting Style feature',
    text: 'While you wear Light, Medium or Heavy armor, you gain a +1 bonus to Armor Class.',
  },
  {
    id: 'great-weapon-fighting',
    name: 'Great Weapon Fighting',
    category: 'fighting-style',
    prerequisite: 'Fighting Style feature',
    text: 'When you roll damage for a Melee weapon you hold with two hands (Two-Handed or Versatile), treat any 1 or 2 on a damage die as a 3.',
  },
  {
    id: 'two-weapon-fighting',
    name: 'Two-Weapon Fighting',
    category: 'fighting-style',
    prerequisite: 'Fighting Style feature',
    text: 'When you make an extra attack from the Light property, you can add your ability modifier to its damage.',
  },

  /* Epic boons */
  {
    id: 'boon-of-combat-prowess',
    name: 'Boon of Combat Prowess',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 1, to a maximum of 30. Peerless Aim: once per turn when you miss with an attack roll, you can hit instead.',
  },
  {
    id: 'boon-of-dimensional-travel',
    name: 'Boon of Dimensional Travel',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 1, to a maximum of 30. Blink Steps: right after you take the Attack action or the Magic action, you can teleport up to 30 feet to an unoccupied space you can see.',
  },
  {
    id: 'boon-of-fate',
    name: 'Boon of Fate',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 1, to a maximum of 30. Improve Fate: when you or a creature within 60 feet succeeds or fails a d20 Test, roll 2d4 and apply it as a bonus or penalty. Once per Initiative roll or Short or Long Rest.',
  },
  {
    id: 'boon-of-irresistible-offense',
    name: 'Boon of Irresistible Offense',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ['str', 'dex'],
    text: 'Increase Strength or Dexterity by 1, to a maximum of 30. Your Bludgeoning, Piercing and Slashing damage ignores Resistance. Overwhelming Strike: when you roll a 20 on an attack roll, deal extra damage of the attack\'s type equal to the increased ability score.',
  },
  {
    id: 'boon-of-spell-recall',
    name: 'Boon of Spell Recall',
    category: 'epic-boon',
    prerequisite: 'Level 19+, Spellcasting feature',
    minLevel: 19,
    abilityIncrease: ['int', 'wis', 'cha'],
    text: 'Increase Intelligence, Wisdom or Charisma by 1, to a maximum of 30. Free Casting: once per Long Rest, cast a prepared spell with a level 1-4 slot without expending the slot.',
  },
  {
    id: 'boon-of-the-night-spirit',
    name: 'Boon of the Night Spirit',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 1, to a maximum of 30. While in Dim Light or Darkness you can become Invisible as a Bonus Action (until you act, react or enter Bright Light), and you have Resistance to all damage except Psychic and Radiant.',
  },
  {
    id: 'boon-of-truesight',
    name: 'Boon of Truesight',
    category: 'epic-boon',
    prerequisite: 'Level 19+',
    minLevel: 19,
    abilityIncrease: ANY,
    text: 'Increase one ability score by 1, to a maximum of 30. You have Truesight with a range of 60 feet.',
  },
];
