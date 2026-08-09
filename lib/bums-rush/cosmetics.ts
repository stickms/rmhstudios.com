/**
 * Bum's Rush — the cosmetic id catalog (design doc §2.4, §2.5, §11.2).
 *
 * This is the one list of legal `head`/`hat`/`gloves`/`ink` ids, imported by
 * both tiers:
 *
 * - **Client:** the wardrobe screen renders from it, and `progress/unlocks.ts`
 *   grants against it.
 * - **Server:** `progress/save.server.ts` validates any cosmetics a client
 *   writes to `/api/bums-rush/profile` against it, and the socket handler
 *   (§9, a separate ticket) validates `br:setCosmetics` the same way — a
 *   client sending `head: '<img src=x onerror=...>'` fails here, not at
 *   render time in four other players' browsers.
 *
 * No `.server` suffix: this file touches no secrets and no Node-only API, and
 * it needs to load in the browser bundle for exactly the reasons above.
 */

/** Design doc §2.4 — sixteen launch heads, in unlock order. */
export type HeadId =
  | 'biro'
  | 'eraser'
  | 'sharpener'
  | 'staple'
  | 'paper-plane'
  | 'teacup'
  | 'whisk'
  | 'balloon'
  | 'lightbulb'
  | 'helm'
  | 'inkpot'
  | 'shuriken'
  | 'snowball'
  | 'helmet'
  | 'speaker'
  | 'inkblot';

/** Design doc §2.5 — twenty-four hats, one set of three per world. */
export type HatId =
  | 'party-hat'
  | 'chefs-toque'
  | 'colander'
  | 'traffic-cone'
  | 'snorkel'
  | 'sticky-note'
  | 'halo'
  | 'paperclip-crown'
  | 'pencil-topper'
  | 'envelope-fold'
  | 'binder-clip'
  | 'thumbtack-crown'
  | 'bandana-doodle'
  | 'propeller-cap'
  | 'graduation-cap'
  | 'pirate-fold'
  | 'crown-of-tape'
  | 'rubber-band-tangle'
  | 'push-pin-halo'
  | 'folder-tab'
  | 'stamp-hat'
  | 'ribbon-bow'
  | 'eraser-topper'
  | 'crown-bent';

/** Design doc §2.5 — twelve gloves. `mitten` is the default (bare mitten). */
export type GlovesId =
  | 'mitten'
  | 'oven-mitt'
  | 'boxing-glove'
  | 'rubber-glove'
  | 'gauntlet'
  | 'ninja-tabi-hand'
  | 'bubble-wrap'
  | 'winter-mitten'
  | 'gardening-glove'
  | 'surgical-glove'
  | 'catchers-mitt'
  | 'welding-glove';

/**
 * Design doc §2.5 — ten inks "at launch" plus one secret. `seat-1..4` are the
 * four seat pens (§2.8); `gold-ink` is the 100%-campaign reward (§11.2), which
 * is why the launch count in §2.5's table (10) is one short of this list's
 * length (11) — the secret ink is deliberately not part of "at launch".
 */
export type InkId =
  | 'seat-1'
  | 'seat-2'
  | 'seat-3'
  | 'seat-4'
  | 'highlighter-yellow'
  | 'pencil-grey'
  | 'red-correction'
  | 'gel-sparkle'
  | 'invisible-ink'
  | 'crayon'
  | 'gold-ink';

export type CosmeticSlot = 'head' | 'hat' | 'gloves' | 'ink';

/** Union of every valid cosmetic id, across every slot. Ids are unique across slots. */
export type CosmeticId = HeadId | HatId | GlovesId | InkId;

export const HEAD_IDS: readonly HeadId[] = [
  'biro',
  'eraser',
  'sharpener',
  'staple',
  'paper-plane',
  'teacup',
  'whisk',
  'balloon',
  'lightbulb',
  'helm',
  'inkpot',
  'shuriken',
  'snowball',
  'helmet',
  'speaker',
  'inkblot',
];

export const HAT_IDS: readonly HatId[] = [
  'party-hat',
  'chefs-toque',
  'colander',
  'traffic-cone',
  'snorkel',
  'sticky-note',
  'halo',
  'paperclip-crown',
  'pencil-topper',
  'envelope-fold',
  'binder-clip',
  'thumbtack-crown',
  'bandana-doodle',
  'propeller-cap',
  'graduation-cap',
  'pirate-fold',
  'crown-of-tape',
  'rubber-band-tangle',
  'push-pin-halo',
  'folder-tab',
  'stamp-hat',
  'ribbon-bow',
  'eraser-topper',
  'crown-bent',
];

export const GLOVES_IDS: readonly GlovesId[] = [
  'mitten',
  'oven-mitt',
  'boxing-glove',
  'rubber-glove',
  'gauntlet',
  'ninja-tabi-hand',
  'bubble-wrap',
  'winter-mitten',
  'gardening-glove',
  'surgical-glove',
  'catchers-mitt',
  'welding-glove',
];

export const INK_IDS: readonly InkId[] = [
  'seat-1',
  'seat-2',
  'seat-3',
  'seat-4',
  'highlighter-yellow',
  'pencil-grey',
  'red-correction',
  'gel-sparkle',
  'invisible-ink',
  'crayon',
  'gold-ink',
];

/** Design doc §2.5 — "Count at launch": `gold-ink` is earned, not shipped equippable day one. */
export const LAUNCH_INK_IDS: readonly InkId[] = INK_IDS.filter((id) => id !== 'gold-ink');

/** Every legal cosmetic id, regardless of slot — the flat set the socket handler checks membership in. */
export const ALL_COSMETIC_IDS: ReadonlySet<CosmeticId> = new Set<CosmeticId>([
  ...HEAD_IDS,
  ...HAT_IDS,
  ...GLOVES_IDS,
  ...INK_IDS,
]);

const HEAD_SET: ReadonlySet<string> = new Set(HEAD_IDS);
const HAT_SET: ReadonlySet<string> = new Set(HAT_IDS);
const GLOVES_SET: ReadonlySet<string> = new Set(GLOVES_IDS);
const INK_SET: ReadonlySet<string> = new Set(INK_IDS);

export function isHeadId(id: string): id is HeadId {
  return HEAD_SET.has(id);
}
export function isHatId(id: string): id is HatId {
  return HAT_SET.has(id);
}
export function isGlovesId(id: string): id is GlovesId {
  return GLOVES_SET.has(id);
}
export function isInkId(id: string): id is InkId {
  return INK_SET.has(id);
}
export function isCosmeticId(id: string): id is CosmeticId {
  return ALL_COSMETIC_IDS.has(id as CosmeticId);
}

/**
 * The equipped set a client submitted, checked slot-by-slot.
 *
 * `hat` is nullable in the shared `Cosmetics` contract (bare head is a valid
 * look) so `null` passes; anything else must resolve in its slot's catalog.
 */
export function isValidCosmetics(cosmetics: {
  head: string;
  hat: string | null;
  gloves: string;
  ink: string;
}): boolean {
  return (
    isHeadId(cosmetics.head) &&
    (cosmetics.hat === null || isHatId(cosmetics.hat)) &&
    isGlovesId(cosmetics.gloves) &&
    isInkId(cosmetics.ink)
  );
}

/**
 * Design doc §11.2 "First launch" row — everything a brand-new profile owns
 * before any unlock fires. The equipped default look is `constants.ts`'s
 * `DEFAULT_COSMETICS` (`'biro'`/`null`/`'mitten'`/`'seat-1'`) — not repeated
 * here, so there is exactly one place that tuple is spelled out.
 */
export const STARTER_COSMETICS: readonly CosmeticId[] = [
  'biro',
  'eraser',
  'sharpener',
  'mitten',
  'seat-1',
  'seat-2',
  'seat-3',
  'seat-4',
];
