// lib/signal-forge/Event.ts — Random between-floor events

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  choices: EventChoice[];
  minFloor: number;
}

export interface EventChoice {
  label: string;
  description: string;
  effect: 'heal' | 'currency' | 'removeCard' | 'addCard' | 'addRelic' |
          'upgradeCard' | 'maxHp' | 'loseHp' | 'gainStatic' | 'reduceStatic';
  value: number;
}

export const eventTemplates: GameEvent[] = [
  {
    id: 'data_cache',
    name: 'Data Cache',
    description: 'You find a hidden data cache among the wreckage.',
    minFloor: 1,
    choices: [
      { label: 'Crack it open', description: 'Gain 50💰', effect: 'currency', value: 50 },
      { label: 'Absorb its energy', description: 'Heal 25% max HP', effect: 'heal', value: 25 },
    ],
  },
  {
    id: 'repair_station',
    name: 'Repair Station',
    description: 'An old repair station hums to life.',
    minFloor: 1,
    choices: [
      { label: 'Repair', description: 'Heal 30% max HP', effect: 'heal', value: 30 },
      { label: 'Scavenge parts', description: 'Gain 30💰', effect: 'currency', value: 30 },
    ],
  },
  {
    id: 'signal_purifier',
    name: 'Signal Purifier',
    description: 'A device offers to clean your signal.',
    minFloor: 2,
    choices: [
      { label: 'Purify', description: 'Remove 1 card from deck', effect: 'removeCard', value: 1 },
      { label: 'Sell it', description: 'Gain 25💰', effect: 'currency', value: 25 },
    ],
  },
  {
    id: 'card_transmuter',
    name: 'Card Transmuter',
    description: 'A strange machine hums with transformative energy.',
    minFloor: 3,
    choices: [
      { label: 'Transmute', description: 'Upgrade a random card', effect: 'upgradeCard', value: 1 },
      { label: 'Disassemble for parts', description: 'Gain 40💰', effect: 'currency', value: 40 },
    ],
  },
  {
    id: 'forbidden_knowledge',
    name: 'Forbidden Knowledge',
    description: 'Dark texts promise power at a price.',
    minFloor: 4,
    choices: [
      { label: 'Read them', description: 'Add 1 random rare card + 1 Glitch card', effect: 'addCard', value: 1 },
      { label: 'Destroy them', description: 'Gain 30💰', effect: 'currency', value: 30 },
    ],
  },
  {
    id: 'power_surge',
    name: 'Power Surge',
    description: 'A power conduit overloads nearby.',
    minFloor: 2,
    choices: [
      { label: 'Absorb it', description: '+3 max HP permanently', effect: 'maxHp', value: 3 },
      { label: 'Redirect', description: 'Gain 40💰', effect: 'currency', value: 40 },
    ],
  },
  {
    id: 'static_discharge_event',
    name: 'Static Discharge',
    description: 'A wave of interference crackles through the air.',
    minFloor: 1,
    choices: [
      { label: 'Ground yourself', description: 'Reduce Static to 0', effect: 'reduceStatic', value: 999 },
      { label: 'Harness it', description: 'Gain 35💰 but +2 Static', effect: 'gainStatic', value: 2 },
    ],
  },
  {
    id: 'ancient_terminal',
    name: 'Ancient Terminal',
    description: 'A terminal displays forgotten data about signal processing.',
    minFloor: 3,
    choices: [
      { label: 'Study it', description: '+5 max HP permanently', effect: 'maxHp', value: 5 },
      { label: 'Purge old data', description: 'Remove 1 card from deck', effect: 'removeCard', value: 1 },
    ],
  },
  {
    id: 'the_wager',
    name: 'The Wager',
    description: 'A holographic figure challenges you to a bet.',
    minFloor: 3,
    choices: [
      { label: 'Accept (costs 40💰)', description: '50% chance: gain 100💰. 50% chance: lose 40💰.', effect: 'currency', value: 0 },
      { label: 'Walk away wiser', description: '+2 max HP permanently', effect: 'maxHp', value: 2 },
    ],
  },
  {
    id: 'scrap_merchant',
    name: 'Scrap Merchant',
    description: 'A traveling merchant offers unusual wares.',
    minFloor: 2,
    choices: [
      { label: 'Trade HP for gold', description: 'Lose 10 HP, gain 60💰', effect: 'loseHp', value: 10 },
      { label: 'Trade gold for HP', description: 'Pay 30💰, heal 20% max HP', effect: 'heal', value: 20 },
    ],
  },
  {
    id: 'corrupted_forge',
    name: 'Corrupted Forge',
    description: 'A malfunctioning forge sparks with unstable energy. It could upgrade your equipment — but at a cost.',
    minFloor: 4,
    choices: [
      { label: 'Reforge a card', description: 'Upgrade a random card, but add 1 Glitch to deck', effect: 'upgradeCard', value: 1 },
      { label: 'Melt for scrap', description: 'Gain 45💰', effect: 'currency', value: 45 },
    ],
  },
  {
    id: 'frequency_shrine',
    name: 'Frequency Shrine',
    description: 'An ancient shrine resonates at a harmonic frequency. You feel its energy tugging at your signal.',
    minFloor: 2,
    choices: [
      { label: 'Attune', description: '+4 max HP permanently', effect: 'maxHp', value: 4 },
      { label: 'Disrupt', description: 'Gain 35💰 but +1 Static', effect: 'gainStatic', value: 1 },
    ],
  },
  {
    id: 'data_broker',
    name: 'Data Broker',
    description: 'A shady figure offers to "optimize" your deck — for a fee.',
    minFloor: 3,
    choices: [
      { label: 'Pay for optimization (50💰)', description: 'Remove 1 card + upgrade 1 random card', effect: 'removeCard', value: 1 },
      { label: 'Steal their data', description: 'Add 1 random rare card, +3 Static', effect: 'addCard', value: 1 },
    ],
  },
];
