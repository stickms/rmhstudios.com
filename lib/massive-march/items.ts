/**
 * Massive March — the things you can pick up.
 *
 * Inventory is physical and small on purpose (§10). There is no menu holding
 * everything you have ever found: one item in your hands, two on your belt, and
 * four more only if somebody is wearing a backpack — and the backpack's wearer
 * cannot reach into it, which is the whole joke and also the whole mechanic.
 *
 * The consequence the design is after is that equipment has to be *distributed*.
 * Before a group splits up somebody has to ask who has the radio, who has a
 * torch, and where the map ended up, and sometimes the answer is "on a rock,
 * two kilometres back".
 */

import { LAND, TOY } from './palette';

export type ItemKind =
  | 'radio'
  | 'megaphone'
  | 'laser'
  | 'binoculars'
  | 'board'
  | 'torch'
  | 'flare'
  | 'bell'
  | 'detector'
  | 'map'
  | 'bucket'
  | 'backpack'
  | 'ball'
  | 'orb';

export type Slot = 'hands' | 'belt' | 'pack' | 'worn';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  /** Where this may be kept. `hands` only means it is too awkward to stow. */
  slots: readonly Slot[];
  /** Kilograms-ish. Drives throw distance and whether a kick moves it. */
  mass: number;
  color: string;
  /** How the use key behaves, if at all. */
  use?: 'toggle' | 'press' | 'text' | 'aim';
  /** Shown once, when it is first picked up. Never explains a puzzle. */
  blurb: string;
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  radio: {
    kind: 'radio',
    name: 'Walkie-talkie',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.6,
    color: TOY.black,
    use: 'toggle',
    blurb: 'Talks to other radios at any distance the repeater allows. Nobody else hears it.',
  },
  megaphone: {
    kind: 'megaphone',
    name: 'Megaphone',
    slots: ['hands'],
    mass: 1.6,
    color: TOY.red,
    use: 'toggle',
    blurb: 'Everyone within a hundred metres hears you. Everyone.',
  },
  laser: {
    kind: 'laser',
    name: 'Laser pointer',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.15,
    color: TOY.green,
    use: 'toggle',
    blurb: 'Puts a dot on the thing you mean, which is shorter than describing it.',
  },
  binoculars: {
    kind: 'binoculars',
    name: 'Binoculars',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.8,
    color: TOY.blue,
    use: 'toggle',
    blurb: 'For reading something a long way off, or for having stolen from you.',
  },
  board: {
    kind: 'board',
    name: 'Whiteboard',
    slots: ['hands'],
    mass: 2.2,
    color: TOY.white,
    use: 'text',
    blurb: 'Write something on it. Anyone who can see you can read it.',
  },
  torch: {
    kind: 'torch',
    name: 'Torch',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.5,
    color: TOY.yellow,
    use: 'toggle',
    blurb: 'A cone of light, and a signal if you flick it on and off.',
  },
  flare: {
    kind: 'flare',
    name: 'Flare',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.4,
    color: TOY.pink,
    use: 'press',
    blurb: 'Burns for a minute and can be seen from the ridge. There are not many.',
  },
  bell: {
    kind: 'bell',
    name: 'Cowbell',
    slots: ['hands', 'belt', 'pack'],
    mass: 1.1,
    color: TOY.yellowDeep,
    use: 'press',
    blurb: 'Loud, locatable, and impossible to ignore. Use responsibly.',
  },
  detector: {
    kind: 'detector',
    name: 'Finder',
    slots: ['hands'],
    mass: 1.8,
    color: TOY.green,
    use: 'toggle',
    blurb: 'Clicks faster near something buried. It will not tell you which way.',
  },
  map: {
    kind: 'map',
    name: 'Paper map',
    slots: ['hands', 'belt', 'pack'],
    mass: 0.2,
    color: LAND.sandDry,
    use: 'toggle',
    blurb: 'The island, on paper. You have to stop walking to read it.',
  },
  bucket: {
    kind: 'bucket',
    name: 'Bucket',
    slots: ['hands', 'worn'],
    mass: 1.4,
    color: TOY.blue,
    use: 'toggle',
    blurb: 'Wear it and you can see nothing at all. That is the intended use.',
  },
  backpack: {
    kind: 'backpack',
    name: 'Backpack',
    slots: ['hands', 'worn'],
    mass: 2.0,
    color: TOY.green,
    blurb: 'Holds four more things. You cannot reach it yourself — ask someone.',
  },
  ball: {
    kind: 'ball',
    name: 'Glowing ball',
    slots: ['hands'],
    mass: 4.5,
    color: TOY.yellow,
    blurb: 'Heavy, bright, and it rolls downhill given the slightest excuse.',
  },
  orb: {
    kind: 'orb',
    name: 'Red round',
    slots: ['hands', 'belt', 'pack'],
    mass: 1.2,
    color: '#d81f1a',
    blurb: 'A puzzle produced it. The towers want them. Nothing explains why.',
  },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && value in ITEMS;
}

export const HANDS_CAPACITY = 1;
export const BELT_CAPACITY = 2;
export const PACK_CAPACITY = 4;

export function slotCapacity(slot: Slot): number {
  switch (slot) {
    case 'hands':
      return HANDS_CAPACITY;
    case 'belt':
      return BELT_CAPACITY;
    case 'pack':
      return PACK_CAPACITY;
    case 'worn':
      return 2; // a bucket on your head and a backpack on your back
  }
}

export function canHold(kind: ItemKind, slot: Slot): boolean {
  return ITEMS[kind].slots.includes(slot);
}

/**
 * Throw speed for an item, given a 0…1 wind-up.
 *
 * Light things go far and land badly; the glowing ball barely leaves your hands
 * and then keeps going once it hits the ground, which is why it is the one used
 * for the hoop.
 */
export function throwSpeed(kind: ItemKind, power: number): number {
  const mass = ITEMS[kind].mass;
  const base = 15 / (1 + mass * 0.45);
  return base * (0.45 + 0.55 * Math.min(1, Math.max(0, power)));
}

/** A kick is a flat impulse, so heavy things move less and low things move at all. */
export function kickSpeed(kind: ItemKind): number {
  return 11 / (1 + ITEMS[kind].mass * 0.3);
}
