/**
 * Massive March — art direction, as data.
 *
 * The look is a deliberate collision, and every colour here belongs to one side
 * of it or the other:
 *
 *  - **The land is observed.** Granite headlands, gum-tree gullies, banksia
 *    scrub, squeaky pale sand, shallow water going green over sand and blue over
 *    rock. Desaturated, warm, and lit like a real coast at a real hour — the
 *    sunrise reds through leaves are the whole reason to walk somewhere at
 *    dawn.
 *  - **Everything built is a toy.** Flat, unshaded, primary: post-box red,
 *    school-bus yellow, a blue with no grey in it. Simple solids at a size
 *    nothing on a real coast has any business being, as though somebody left
 *    enormous building blocks out on the headland. They read from three hundred
 *    metres, which is what makes them navigation.
 *
 * Keeping the palette out of the components means the scene, the map sheet, the
 * key art script and the HUD all quote the same hexes instead of drifting apart.
 * Hex strings (not three.js `Color`s) so the server and a plain `<svg>` can read
 * this file too.
 */

/** The built world: flat, saturated, unapologetic. */
export const TOY = {
  red: '#e03127',
  redDeep: '#a9231c',
  yellow: '#f5b715',
  yellowDeep: '#d1900a',
  blue: '#1f5fd0',
  blueDeep: '#16408c',
  white: '#f2efe6',
  concrete: '#cfc7b6',
  green: '#2e9e5b',
  pink: '#e8709a',
  black: '#22201d',
} as const;

/** The observed world: everything that grew or eroded into place. */
export const LAND = {
  sandDry: '#e6d8b8',
  sandWet: '#c9b78f',
  grassDry: '#a8a765',
  grassLush: '#6f8a45',
  scrub: '#5c6b3a',
  granite: '#9d968c',
  graniteShade: '#736d64',
  graniteWarm: '#b3a08c',
  soil: '#7a6448',
  gumBark: '#cfc3b0',
  gumLeaf: '#7f9166',
  banksia: '#4f6134',
  waterShallow: '#3f9d94',
  waterDeep: '#1c5f74',
  foam: '#eaf4f2',
} as const;

/** Sky keys sampled through the day; the scene lerps between them. */
export const SKY = {
  night: { top: '#0b1230', bottom: '#1d2a4d', sun: '#9fb4e8', fog: '#141c38' },
  dawn: { top: '#2f4a7a', bottom: '#e8865a', sun: '#ffd9a0', fog: '#7a6b74' },
  day: { top: '#4f93d6', bottom: '#bfe0f2', sun: '#fff6df', fog: '#cfe3ee' },
  dusk: { top: '#3a3f77', bottom: '#e0663f', sun: '#ffc27a', fog: '#8e6f74' },
} as const;

/**
 * Avatar colours. Players are round, bird-ish things on long thin legs — closer
 * to a novelty drinking bird than to any animal — so the body is one flat solid
 * and the whole silhouette is the identity. Twelve, one per seat, all
 * distinguishable at distance and in the dark, which is the only requirement
 * that matters when someone is describing which of you is standing on the rock.
 */
export const AVATAR_COLORS = [
  '#e03127', // red
  '#f5b715', // yellow
  '#1f5fd0', // blue
  '#2e9e5b', // green
  '#e8709a', // pink
  '#f27430', // orange
  '#8f5fd0', // violet
  '#25b6c4', // teal
  '#f2efe6', // white
  '#8a5a2b', // brown
  '#c2d63f', // lime
  '#2a2f3a', // slate
] as const;

export const AVATAR_COLOR_NAMES = [
  'Red',
  'Yellow',
  'Blue',
  'Green',
  'Pink',
  'Orange',
  'Violet',
  'Teal',
  'White',
  'Brown',
  'Lime',
  'Slate',
] as const;

export function avatarColor(slot: number): string {
  return AVATAR_COLORS[((slot % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
}

/** The reward objects. One red, used nowhere else in the world. */
export const ORB_COLOR = '#d81f1a';
export const ORB_EMISSIVE = '#5c0300';
