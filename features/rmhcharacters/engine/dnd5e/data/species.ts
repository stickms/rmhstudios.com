import type { Dnd5eSpecies } from '../../types';

/** SRD 5.2 species (2024 rules). Species grant traits only; ability increases come from the background. */
export const DND5E_SPECIES: Dnd5eSpecies[] = [
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    sizes: ['Medium'],
    speed: 30,
    darkvision: 60,
    traits: [
      { name: 'Draconic Ancestry', text: 'Choose a dragon ancestor; it sets your Breath Weapon and Damage Resistance type.' },
      { name: 'Breath Weapon', text: 'In place of one attack of the Attack action, exhale a 15-foot Cone or a 30-foot Line 5 feet wide. Each creature makes a Dexterity save (DC 8 + Con modifier + Proficiency Bonus), taking 1d10 damage on a failure or half on a success; 2d10 at level 5, 3d10 at 11 and 4d10 at 17. Uses equal your Proficiency Bonus per Long Rest.' },
      { name: 'Damage Resistance', text: 'You have Resistance to your ancestry\'s damage type.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
      { name: 'Draconic Flight', text: 'From level 5, as a Bonus Action sprout spectral wings for 10 minutes and gain a Fly Speed equal to your Speed. Once per Long Rest.' },
    ],
    options: {
      label: 'Draconic Ancestry',
      choices: [
        { id: 'black', name: 'Black', text: 'Acid damage.' },
        { id: 'blue', name: 'Blue', text: 'Lightning damage.' },
        { id: 'brass', name: 'Brass', text: 'Fire damage.' },
        { id: 'bronze', name: 'Bronze', text: 'Lightning damage.' },
        { id: 'copper', name: 'Copper', text: 'Acid damage.' },
        { id: 'gold', name: 'Gold', text: 'Fire damage.' },
        { id: 'green', name: 'Green', text: 'Poison damage.' },
        { id: 'red', name: 'Red', text: 'Fire damage.' },
        { id: 'silver', name: 'Silver', text: 'Cold damage.' },
        { id: 'white', name: 'White', text: 'Cold damage.' },
      ],
    },
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    sizes: ['Medium'],
    speed: 30,
    darkvision: 120,
    traits: [
      { name: 'Darkvision', text: 'You have Darkvision with a range of 120 feet.' },
      { name: 'Dwarven Resilience', text: 'You have Resistance to Poison damage and Advantage on saves to avoid or end the Poisoned condition.' },
      { name: 'Dwarven Toughness', text: 'Your Hit Point maximum increases by 1, and by 1 more each time you gain a level.' },
      { name: 'Stonecunning', text: 'As a Bonus Action, gain Tremorsense with a range of 60 feet for 10 minutes while on or touching stone. Uses equal your Proficiency Bonus per Long Rest.' },
    ],
  },
  {
    id: 'elf',
    name: 'Elf',
    sizes: ['Medium'],
    speed: 30,
    darkvision: 60,
    traits: [
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
      { name: 'Elven Lineage', text: 'Choose a lineage. You gain its level 1 benefit and, at levels 3 and 5, a spell you always have prepared and can cast once per Long Rest without a slot. Intelligence, Wisdom or Charisma is your spellcasting ability for them (choose when you pick the lineage).' },
      { name: 'Fey Ancestry', text: 'You have Advantage on saves to avoid or end the Charmed condition.' },
      { name: 'Keen Senses', text: 'You have proficiency in Insight, Perception or Survival.' },
      { name: 'Trance', text: 'You do not need to sleep, and you finish a Long Rest in 4 hours of meditation while remaining conscious.' },
    ],
    options: {
      label: 'Elven Lineage',
      choices: [
        { id: 'drow', name: 'Drow', text: 'Darkvision increases to 120 feet and you know Dancing Lights. Level 3: Faerie Fire. Level 5: Darkness.' },
        { id: 'high-elf', name: 'High Elf', text: 'You know Prestidigitation and can swap it for another Wizard cantrip after a Long Rest. Level 3: Detect Magic. Level 5: Misty Step.' },
        { id: 'wood-elf', name: 'Wood Elf', text: 'Your Speed increases to 35 feet and you know Druidcraft. Level 3: Longstrider. Level 5: Pass without Trace.' },
      ],
    },
    skillChoice: { count: 1, from: ['insight', 'perception', 'survival'] },
  },
  {
    id: 'gnome',
    name: 'Gnome',
    sizes: ['Small'],
    speed: 30,
    darkvision: 60,
    traits: [
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
      { name: 'Gnomish Cunning', text: 'You have Advantage on Intelligence, Wisdom and Charisma saving throws.' },
      { name: 'Gnomish Lineage', text: 'Choose a lineage; Intelligence, Wisdom or Charisma is your spellcasting ability for its spells.' },
    ],
    options: {
      label: 'Gnomish Lineage',
      choices: [
        { id: 'forest-gnome', name: 'Forest Gnome', text: 'You know Minor Illusion and always have Speak with Animals prepared; cast it without a slot a number of times equal to your Proficiency Bonus per Long Rest.' },
        { id: 'rock-gnome', name: 'Rock Gnome', text: 'You know Mending and Prestidigitation. Spend 10 minutes casting Prestidigitation to make a Tiny clockwork device (AC 5, 1 HP) that lasts 8 hours; up to three at once.' },
      ],
    },
  },
  {
    id: 'goliath',
    name: 'Goliath',
    sizes: ['Medium'],
    speed: 35,
    traits: [
      { name: 'Giant Ancestry', text: 'Choose a supernatural boon from your giant ancestry. Uses equal your Proficiency Bonus per Long Rest.' },
      { name: 'Large Form', text: 'From level 5, as a Bonus Action become Large for 10 minutes: Advantage on Strength checks and +10 feet of Speed. Once per Long Rest.' },
      { name: 'Powerful Build', text: 'You have Advantage on checks to end the Grappled condition and count as one size larger for carrying capacity.' },
    ],
    options: {
      label: 'Giant Ancestry',
      choices: [
        { id: 'cloud', name: 'Cloud\'s Jaunt (Cloud Giant)', text: 'As a Bonus Action, teleport up to 30 feet to an unoccupied space you can see.' },
        { id: 'fire', name: 'Fire\'s Burn (Fire Giant)', text: 'When you hit with an attack roll and deal damage, deal an extra 1d10 Fire damage.' },
        { id: 'frost', name: 'Frost\'s Chill (Frost Giant)', text: 'When you hit with an attack roll and deal damage, deal an extra 1d6 Cold damage and reduce the target\'s Speed by 10 feet until your next turn starts.' },
        { id: 'hill', name: 'Hill\'s Tumble (Hill Giant)', text: 'When you hit a Large or smaller creature with an attack roll and deal damage, knock it Prone.' },
        { id: 'stone', name: 'Stone\'s Endurance (Stone Giant)', text: 'As a Reaction when you take damage, roll 1d12 and add your Constitution modifier; reduce the damage by that total.' },
        { id: 'storm', name: 'Storm\'s Thunder (Storm Giant)', text: 'As a Reaction when a creature within 60 feet damages you, deal it 1d8 Thunder damage.' },
      ],
    },
  },
  {
    id: 'halfling',
    name: 'Halfling',
    sizes: ['Small'],
    speed: 30,
    traits: [
      { name: 'Brave', text: 'You have Advantage on saves to avoid or end the Frightened condition.' },
      { name: 'Halfling Nimbleness', text: 'You can move through the space of any creature a size larger than you, but cannot stop there.' },
      { name: 'Luck', text: 'When you roll a 1 on the d20 of a d20 Test, you can reroll the die and must use the new roll.' },
      { name: 'Naturally Stealthy', text: 'You can take the Hide action even when obscured only by a creature at least one size larger than you.' },
    ],
  },
  {
    id: 'human',
    name: 'Human',
    sizes: ['Small', 'Medium'],
    speed: 30,
    traits: [
      { name: 'Resourceful', text: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
      { name: 'Skillful', text: 'You gain proficiency in one skill of your choice.' },
      { name: 'Versatile', text: 'You gain an Origin feat of your choice (Skilled is recommended).' },
    ],
    extraOriginFeat: true,
    skillChoice: { count: 1 },
  },
  {
    id: 'orc',
    name: 'Orc',
    sizes: ['Medium'],
    speed: 30,
    darkvision: 120,
    traits: [
      { name: 'Adrenaline Rush', text: 'Take the Dash action as a Bonus Action; when you do, gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal your Proficiency Bonus per Short or Long Rest.' },
      { name: 'Darkvision', text: 'You have Darkvision with a range of 120 feet.' },
      { name: 'Relentless Endurance', text: 'When you are reduced to 0 Hit Points but not killed outright, drop to 1 Hit Point instead. Once per Long Rest.' },
    ],
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    sizes: ['Small', 'Medium'],
    speed: 30,
    darkvision: 60,
    traits: [
      { name: 'Darkvision', text: 'You have Darkvision with a range of 60 feet.' },
      { name: 'Fiendish Legacy', text: 'Choose a legacy: a resistance and a cantrip at level 1, and spells at levels 3 and 5 that you always have prepared and can cast once per Long Rest without a slot. Intelligence, Wisdom or Charisma is your spellcasting ability for them.' },
      { name: 'Otherworldly Presence', text: 'You know the Thaumaturgy cantrip, using the same spellcasting ability as your legacy.' },
    ],
    options: {
      label: 'Fiendish Legacy',
      choices: [
        { id: 'abyssal', name: 'Abyssal', text: 'Resistance to Poison damage and the Poison Spray cantrip. Level 3: Ray of Sickness. Level 5: Hold Person.' },
        { id: 'chthonic', name: 'Chthonic', text: 'Resistance to Necrotic damage and the Chill Touch cantrip. Level 3: False Life. Level 5: Ray of Enfeeblement.' },
        { id: 'infernal', name: 'Infernal', text: 'Resistance to Fire damage and the Fire Bolt cantrip. Level 3: Hellish Rebuke. Level 5: Darkness.' },
      ],
    },
  },
];
