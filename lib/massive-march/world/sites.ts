/**
 * Massive March — puzzle installations, progression hubs, and what unlocks what.
 *
 * Every site here is authored to the same rule: **the logic is easy and the
 * telling is hard.** None of these puzzles is difficult to solve once one person
 * understands it. What is difficult is that the person who understands it is
 * behind glass, or at the bottom of a gully, or wearing a bucket, and getting
 * what they know into the hands of the person who can act on it is the whole
 * challenge (design doc §8.4).
 *
 * `crew` is the adaptive-variant knob. A site does not check "are there four
 * players"; it reads how many of its elements are ACTIVE in this world variant,
 * and lights only those. A duo world lights two pressure pads, a band world
 * lights four. That is how a two-player campaign stays solvable without any
 * puzzle being removed from it.
 *
 * Everything in this file is data the server validates against and the client
 * renders from. Neither side may invent a position the other does not have.
 */

import type { WorldVariant } from '../constants';
import { pad } from './terrain';

// ─── Symbols ────────────────────────────────────────────────────────────────

/**
 * The island's glyph set, used by every symbol puzzle.
 *
 * They have ids so the code can talk about them, and deliberately no names in
 * the UI: the group has to invent its own words for these, and one group's
 * "fork tree" is another's "angry antler" (§12.4). Naming them on screen would
 * hand over the exact vocabulary the puzzle exists to make you build.
 */
export const SYMBOLS = ['fork', 'antler', 'frond', 'seed', 'wave', 'stone', 'nest', 'bud'] as const;
export type SymbolId = (typeof SYMBOLS)[number];

// ─── Site geometry ──────────────────────────────────────────────────────────

/** A pressure plate. Occupancy is derived server-side from player positions. */
export interface Spot {
  id: string;
  x: number;
  z: number;
  r: number;
}

/** A walled enclosure that blocks voice and text both ways (§8.1). */
export interface Booth {
  id: string;
  x: number;
  z: number;
  r: number;
  /** Doorway bearing and width, radians — matched by the ring collider. */
  door: [number, number];
}

export type PuzzleKind =
  /** Stand on every lit pad at the same moment. */
  | 'pads'
  /** Read a sequence somewhere it cannot be spoken from; press it somewhere it cannot be seen from. */
  | 'booth'
  /** One player cannot see; the others walk them across the plates in order. */
  | 'blind'
  /** Only the lookout can see the answer; only the operators can turn the totems. */
  | 'totems'
  /** Put the glowing ball through the hoop. Repeatedly. */
  | 'hoop'
  /** Find the buried markers with a detector that only says "warmer". */
  | 'hunt'
  /** All of the above, at once, with the roles split across the island. */
  | 'final';

export interface PuzzleSite {
  id: string;
  /** English name; the UI translates through `mm.site.<id>`. */
  name: string;
  kind: PuzzleKind;
  region: string;
  x: number;
  z: number;
  /** "You are at this site" radius — drives the HUD prompt and site chatter. */
  radius: number;
  /** Red rounds a first completion produces. */
  reward: number;
  /** How many of this site's elements are live, per world variant. */
  crew: Record<WorldVariant, number>;
  /** Tower key that must exist before the site will run. */
  requiresKey?: 'yellow' | 'blue' | 'red';
  /** Some things only happen after dark. */
  nightOnly?: boolean;
  /** The single line painted on the site's sign. Never a solution. */
  sign: string;

  // Kind-specific layout. Present only for the kinds that use them.
  pads?: Spot[];
  booths?: Booth[];
  console?: Spot & { buttons: number };
  plates?: Spot[];
  totems?: Spot[];
  lookout?: Spot;
  hoop?: { x: number; z: number; y: number; r: number; facing: number; throws: number };
  hunt?: { x: number; z: number; r: number; markers: number };
}

/** Ring of `n` spots around a centre, first one at `phase`. */
function ring(prefix: string, cx: number, cz: number, radius: number, n: number, phase = 0, r = 1.5): Spot[] {
  const out: Spot[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push({ id: `${prefix}${i}`, x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius, r });
  }
  return out;
}

// ─── The twelve ─────────────────────────────────────────────────────────────

export const PUZZLE_SITES: readonly PuzzleSite[] = (() => {
  const tideBells = pad('tide-bells');
  const sealedBooth = pad('sealed-booth');
  const bucketWalk = pad('bucket-walk');
  const threeTotems = pad('three-totems');
  const lookout = pad('totem-lookout');
  const hoopBall = pad('hoop-and-ball');
  const cairns = pad('scatter-cairns');
  const splitGlass = pad('split-glass');
  const longRelay = pad('long-relay');
  const nightLamps = pad('night-lamps');
  const deepMaze = pad('deep-maze');
  const highWindow = pad('high-window');
  const finalMarch = pad('final-march');

  return [
    {
      id: 'tide-bells',
      name: 'The Tide Bells',
      kind: 'pads',
      region: 'tidal-landing',
      x: tideBells.x,
      z: tideBells.z,
      radius: 26,
      reward: 1,
      crew: { duo: 2, trio: 3, band: 4 },
      sign: 'ALL AT ONCE',
      // Close together and in plain sight: the first site anybody finds should
      // be solvable by two people shouting "three, two, one" at each other.
      pads: ring('bell', tideBells.x, tideBells.z, 9, 4, 0.4, 1.6),
    },

    {
      id: 'sealed-booth',
      name: 'The Sealed Booth',
      kind: 'booth',
      region: 'tidal-landing',
      x: sealedBooth.x,
      z: sealedBooth.z,
      radius: 30,
      reward: 1,
      crew: { duo: 2, trio: 2, band: 2 },
      sign: 'ONE READS · ONE PRESSES',
      // The booth is soundproof and the console is behind it, so the reader can
      // neither be heard nor point at what they can see. Four glyphs, six
      // buttons: a group that has not agreed on words for the glyphs will get
      // two of them right and then argue.
      booths: [{ id: 'main', x: sealedBooth.x - 9, z: sealedBooth.z + 5, r: 4.6, door: [Math.PI * 0.5, 0.85] }],
      console: { id: 'console', x: sealedBooth.x + 10, z: sealedBooth.z - 6, r: 3.2, buttons: 6 },
    },

    {
      id: 'bucket-walk',
      name: 'The Bucket Walk',
      kind: 'blind',
      region: 'gumtree-gully',
      x: bucketWalk.x,
      z: bucketWalk.z,
      radius: 32,
      reward: 1,
      crew: { duo: 2, trio: 3, band: 3 },
      sign: 'EYES OFF · FEET ON',
      // Five plates, lit one at a time and only for the people who are not
      // wearing the bucket. "Your left" versus "left" is learned here.
      plates: [
        { id: 'p0', x: bucketWalk.x - 12, z: bucketWalk.z + 10, r: 1.8 },
        { id: 'p1', x: bucketWalk.x + 6, z: bucketWalk.z + 14, r: 1.8 },
        { id: 'p2', x: bucketWalk.x + 14, z: bucketWalk.z - 4, r: 1.8 },
        { id: 'p3', x: bucketWalk.x - 4, z: bucketWalk.z - 12, r: 1.8 },
        { id: 'p4', x: bucketWalk.x - 15, z: bucketWalk.z - 3, r: 1.8 },
      ],
    },

    {
      id: 'hoop-and-ball',
      name: 'The Hoop',
      kind: 'hoop',
      region: 'banksia-flats',
      x: hoopBall.x,
      z: hoopBall.z,
      radius: 34,
      reward: 1,
      crew: { duo: 2, trio: 2, band: 2 },
      sign: 'THROUGH · NOT OVER',
      // Physical comedy with a scoreboard. Three passes, because the first one
      // is always luck and everybody knows it.
      hoop: { x: hoopBall.x + 16, z: hoopBall.z - 8, y: 6.4, r: 3.1, facing: 2.6, throws: 3 },
    },

    {
      id: 'scatter-cairns',
      name: 'The Scattered Cairns',
      kind: 'hunt',
      region: 'gumtree-gully',
      x: cairns.x,
      z: cairns.z,
      radius: 40,
      reward: 2,
      crew: { duo: 3, trio: 4, band: 5 },
      sign: 'THE DEVICE ONLY SAYS WARMER',
      // Deliberately larger than a group can sweep together. Fanning out and
      // keeping a chain of voices open is the mechanic; the detector is a
      // distance readout and nothing else.
      hunt: { x: cairns.x, z: cairns.z, r: 78, markers: 5 },
    },

    {
      id: 'three-totems',
      name: 'The Three Totems',
      kind: 'totems',
      region: 'banksia-flats',
      x: threeTotems.x,
      z: threeTotems.z,
      radius: 38,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 3 },
      requiresKey: 'yellow',
      sign: 'THE ANSWER IS NOT HERE',
      // The target facings are painted on the hillside and legible only from
      // the lookout, ninety metres away and forty up. Ordinary speech does not
      // carry that far, which is the first place a radio pays for itself.
      totems: [
        { id: 't0', x: threeTotems.x - 14, z: threeTotems.z + 8, r: 2.4 },
        { id: 't1', x: threeTotems.x + 2, z: threeTotems.z + 15, r: 2.4 },
        { id: 't2', x: threeTotems.x + 15, z: threeTotems.z - 2, r: 2.4 },
      ],
      lookout: { id: 'lookout', x: lookout.x, z: lookout.z, r: 9 },
    },

    {
      id: 'split-glass',
      name: 'Split Glass',
      kind: 'booth',
      region: 'gumtree-gully',
      x: splitGlass.x,
      z: splitGlass.z,
      radius: 34,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 3 },
      requiresKey: 'yellow',
      sign: 'HALF EACH',
      // The same idea as the Sealed Booth with the sequence cut in two and the
      // halves put in booths that cannot hear each other either. Somebody has to
      // be a relay, and relays mishear things.
      booths: [
        { id: 'left', x: splitGlass.x - 15, z: splitGlass.z + 3, r: 4.2, door: [0, 0.8] },
        { id: 'right', x: splitGlass.x + 15, z: splitGlass.z + 3, r: 4.2, door: [Math.PI, 0.8] },
      ],
      console: { id: 'console', x: splitGlass.x, z: splitGlass.z - 14, r: 3.2, buttons: 8 },
    },

    {
      id: 'long-relay',
      name: 'The Long Relay',
      kind: 'pads',
      region: 'granite-spine',
      x: longRelay.x,
      z: longRelay.z,
      radius: 60,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 4 },
      requiresKey: 'blue',
      sign: 'ALL AT ONCE · STILL',
      // The Tide Bells again, except the pads are sixty metres apart behind
      // boulders, so nobody can see anybody and "now" has to survive the trip.
      pads: ring('relay', longRelay.x, longRelay.z, 38, 4, 1.1, 2.0),
    },

    {
      id: 'night-lamps',
      name: 'The Night Lamps',
      kind: 'pads',
      region: 'granite-spine',
      x: nightLamps.x,
      z: nightLamps.z,
      radius: 44,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 3 },
      nightOnly: true,
      sign: 'AFTER DARK ONLY',
      // Same shape, in the dark, on a ridge, with the lamps as the only thing
      // you can see of each other. Whoever is carrying the torches decides how
      // this goes (§9.3).
      pads: ring('lamp', nightLamps.x, nightLamps.z, 21, 3, 0.2, 2.0),
    },

    {
      id: 'deep-maze',
      name: 'The Deep Maze',
      kind: 'blind',
      region: 'quiet-basin',
      x: deepMaze.x,
      z: deepMaze.z,
      radius: 34,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 4 },
      requiresKey: 'blue',
      sign: 'EYES OFF · SIX PLATES',
      // The bucket walk with a longer route and a wall in the middle, so the
      // guides have to split up and hand the blinded player between them.
      plates: [
        { id: 'p0', x: deepMaze.x - 16, z: deepMaze.z + 13, r: 1.7 },
        { id: 'p1', x: deepMaze.x + 3, z: deepMaze.z + 18, r: 1.7 },
        { id: 'p2', x: deepMaze.x + 18, z: deepMaze.z + 6, r: 1.7 },
        { id: 'p3', x: deepMaze.x + 13, z: deepMaze.z - 13, r: 1.7 },
        { id: 'p4', x: deepMaze.x - 6, z: deepMaze.z - 18, r: 1.7 },
        { id: 'p5', x: deepMaze.x - 19, z: deepMaze.z - 4, r: 1.7 },
      ],
    },

    {
      id: 'high-window',
      name: 'The High Window',
      kind: 'totems',
      region: 'granite-spine',
      x: highWindow.x,
      z: highWindow.z,
      radius: 36,
      reward: 2,
      crew: { duo: 2, trio: 3, band: 3 },
      requiresKey: 'red',
      sign: 'LOOK THROUGH · NOT AT',
      // The lookout is a slot in a wall two hundred metres off, so the observer
      // sees the totems at a size where a laser pointer stops being a toy and
      // becomes the only unambiguous way to say "that one".
      totems: [
        { id: 't0', x: highWindow.x - 11, z: highWindow.z + 6, r: 2.4 },
        { id: 't1', x: highWindow.x + 4, z: highWindow.z + 12, r: 2.4 },
        { id: 't2', x: highWindow.x + 13, z: highWindow.z - 4, r: 2.4 },
      ],
      lookout: { id: 'window', x: highWindow.x - 96, z: highWindow.z + 74, r: 7 },
    },

    {
      id: 'final-march',
      name: 'The Final March',
      kind: 'final',
      region: 'quiet-basin',
      x: finalMarch.x,
      z: finalMarch.z,
      radius: 52,
      reward: 3,
      crew: { duo: 2, trio: 3, band: 4 },
      requiresKey: 'red',
      sign: 'READ · TURN · STAND',
      // The synthesis (§12.11). Three stages, in order, and the group has to
      // rearrange itself between each because no two of them want the same
      // people in the same places.
      booths: [{ id: 'main', x: finalMarch.x - 20, z: finalMarch.z + 12, r: 4.4, door: [Math.PI * 0.75, 0.8] }],
      console: { id: 'console', x: finalMarch.x + 2, z: finalMarch.z + 20, r: 3.0, buttons: 8 },
      totems: [
        { id: 't0', x: finalMarch.x + 20, z: finalMarch.z - 2, r: 2.4 },
        { id: 't1', x: finalMarch.x + 26, z: finalMarch.z - 16, r: 2.4 },
        { id: 't2', x: finalMarch.x + 10, z: finalMarch.z - 20, r: 2.4 },
      ],
      lookout: { id: 'lookout', x: finalMarch.x - 34, z: finalMarch.z - 30, r: 7 },
      pads: ring('final', finalMarch.x, finalMarch.z - 4, 15, 4, 0.9, 1.8),
    },
  ];
})();

export const PUZZLE_BY_ID = new Map(PUZZLE_SITES.map((s) => [s.id, s]));

export function puzzleSite(id: string): PuzzleSite | undefined {
  return PUZZLE_BY_ID.get(id);
}

/** Every red round the island can produce. Comfortably more than is needed. */
export const TOTAL_ORBS = PUZZLE_SITES.reduce((sum, s) => sum + s.reward, 0);

/**
 * The mast planted at every installation.
 *
 * Travel time is the game (§7), which only works if there is something to walk
 * TOWARD. Eight of the twelve sites had nothing above the 3.15m sign that stands
 * at the edge of them — legible at forty metres, invisible at two hundred — so
 * an island crossing was a search of open hillside rather than a walk to a thing
 * you had spotted. The one tall marker the sites did have was the red flag, and
 * it went up on completion: you were handed the landmark exactly when you had
 * finished needing it.
 *
 * So the mast is now always there and the FLAG carries the state. Red still
 * means done, unchanged and still readable across a valley; cream means a site
 * nobody has finished. Nothing else moves — the map still refuses to say where
 * you are, and a site is still discovered by standing in it.
 */
export const SITE_MAST_HEIGHT = 11;

export interface SiteMarker {
  /** Ground to the top of the pole, in metres. */
  height: number;
  /** Flag colour. Red is the existing "we have been here" signal. */
  flag: 'open' | 'done';
}

export function siteMarker(solved: boolean): SiteMarker {
  return { height: SITE_MAST_HEIGHT, flag: solved ? 'done' : 'open' };
}

// ─── Towers ─────────────────────────────────────────────────────────────────

export type KeyId = 'yellow' | 'blue' | 'red';
export type UnlockId = 'cart' | 'ridge-road' | 'repeater' | 'gate';

export interface Tower {
  id: KeyId | 'gate';
  name: string;
  x: number;
  z: number;
  radius: number;
  /** Red rounds this hub must be given before it does anything. */
  threshold: number;
  /** What it hands over when it is satisfied. */
  key?: KeyId;
  unlocks: UnlockId[];
  blurb: string;
}

export const TOWERS: readonly Tower[] = (() => {
  const yellow = pad('yellow-tower');
  const blue = pad('blue-vault');
  const red = pad('red-antenna');
  const gate = pad('white-gate');
  return [
    {
      id: 'yellow',
      name: 'The Yellow Tower',
      x: yellow.x,
      z: yellow.z,
      radius: 14,
      threshold: 3,
      key: 'yellow',
      unlocks: ['cart'],
      blurb: 'Wakes the cart line. Two halts, one track, an unreasonable horn.',
    },
    {
      id: 'blue',
      name: 'The Blue Vault',
      x: blue.x,
      z: blue.z,
      radius: 16,
      threshold: 4,
      key: 'blue',
      unlocks: ['ridge-road'],
      blurb: 'Opens the ridge road, and with it everything north of the basin.',
    },
    {
      id: 'red',
      name: 'The Red Antenna',
      x: red.x,
      z: red.z,
      radius: 14,
      threshold: 5,
      key: 'red',
      unlocks: ['repeater'],
      blurb: 'Puts a repeater on the ridge. Radios stop caring how far apart you are.',
    },
    {
      id: 'gate',
      name: 'The White Gate',
      x: gate.x,
      z: gate.z,
      radius: 20,
      threshold: 5,
      unlocks: ['gate'],
      blurb: 'Takes the last of the red rounds, and every key, and the Final March.',
    },
  ];
})();

export const TOWER_BY_ID = new Map(TOWERS.map((t) => [t.id, t]));

/** Deposits needed across all four hubs to finish. Leaves genuine slack. */
export const TOTAL_THRESHOLD = TOWERS.reduce((sum, t) => sum + t.threshold, 0);

/**
 * Radio range before the ridge repeater exists.
 *
 * A radio that worked island-wide from the first hour would delete most of the
 * separation the world is built around, so it starts as a good-but-finite
 * shortcut and only becomes the real thing once the Red Antenna is fed.
 */
export const RADIO_LOCAL_RANGE = 230;

// ─── Item spawns ────────────────────────────────────────────────────────────

/**
 * Where the world keeps its tools.
 *
 * Nothing here is granted by an ability tree (§10) — every one of these is an
 * object lying somewhere, which somebody has to have decided to carry. The
 * caches are deliberately spread out, so "who has the radio" is a real question
 * with a wrong answer.
 */
export interface ItemSpawn {
  kind: string;
  x: number;
  z: number;
}

export const ITEM_SPAWNS: readonly ItemSpawn[] = (() => {
  const landing = pad('landing');
  const cartSouth = pad('cart-south');
  const cartNorth = pad('cart-north');
  const cairns = pad('scatter-cairns');
  const hoopBall = pad('hoop-and-ball');
  const bucketWalk = pad('bucket-walk');
  const deepMaze = pad('deep-maze');
  const antenna = pad('red-antenna');
  const nightLamps = pad('night-lamps');
  const window = pad('high-window');
  const totems = pad('three-totems');

  return [
    // The landing is the tutorial shelf: one of nearly everything.
    { kind: 'radio', x: landing.x - 6, z: landing.z - 4 },
    { kind: 'radio', x: landing.x - 3, z: landing.z - 5 },
    { kind: 'torch', x: landing.x + 3, z: landing.z - 4 },
    { kind: 'torch', x: landing.x + 6, z: landing.z - 5 },
    { kind: 'map', x: landing.x, z: landing.z - 6 },
    { kind: 'board', x: landing.x + 9, z: landing.z - 2 },
    { kind: 'backpack', x: landing.x - 9, z: landing.z - 2 },
    { kind: 'bell', x: landing.x + 12, z: landing.z + 2 },

    // Elsewhere: the tool nearest the puzzle that wants it, and not always.
    { kind: 'megaphone', x: cartSouth.x + 8, z: cartSouth.z + 4 },
    { kind: 'binoculars', x: totems.x - 26, z: totems.z + 22 },
    { kind: 'laser', x: window.x - 90, z: window.z + 70 },
    { kind: 'laser', x: totems.x + 30, z: totems.z + 26 },
    { kind: 'detector', x: cairns.x + 14, z: cairns.z + 20 },
    { kind: 'bucket', x: bucketWalk.x + 2, z: bucketWalk.z + 20 },
    { kind: 'bucket', x: deepMaze.x - 2, z: deepMaze.z + 24 },
    { kind: 'ball', x: hoopBall.x - 12, z: hoopBall.z + 6 },
    { kind: 'flare', x: antenna.x + 10, z: antenna.z + 8 },
    { kind: 'flare', x: nightLamps.x - 12, z: nightLamps.z + 14 },
    { kind: 'torch', x: nightLamps.x + 10, z: nightLamps.z + 12 },
    { kind: 'torch', x: cartNorth.x + 5, z: cartNorth.z + 4 },
    { kind: 'radio', x: cartNorth.x - 5, z: cartNorth.z + 4 },
    { kind: 'map', x: cartNorth.x, z: cartNorth.z + 6 },
    { kind: 'board', x: deepMaze.x + 18, z: deepMaze.z + 18 },
    { kind: 'backpack', x: cartNorth.x - 8, z: cartNorth.z - 2 },
  ];
})();
