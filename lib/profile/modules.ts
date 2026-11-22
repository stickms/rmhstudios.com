/**
 * Profile v2 — the module catalog (§12 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * A profile showcase is an ordered list of typed blocks. This module is the
 * client-safe catalog (kinds, labels, limits) the editor and renderer read; the
 * schema of record — and `parseLayout` / `withModule`, which run it — is in
 * `./modules-schema`. Kept zod-free because the showcase renders on every
 * profile page.
 */

export type { ProfileModule, TopFourItem } from './modules-schema';

export const MAX_MODULES = 12;

export const MODULE_KINDS = [
  'about',
  'stats',
  'status',
  'wishlist',
  'slice-it',
  // P05 (profiles). Rendered by the lazy `components/profile/plus/PlusModules`.
  'top-four',
  'now',
  'stamps',
  'webrings',
  'endorsements',
  'counter',
] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

/** P1 — Top Four: four pinned favourites, each a game or app from the catalogs. */
export const TOP_FOUR_SIZE = 4;

export const MODULE_LABELS: Record<ModuleKind, string> = {
  about: 'About',
  stats: 'Stats',
  status: 'Status',
  wishlist: 'Wishlist',
  'slice-it': 'Slice It!',
  'top-four': 'Top four',
  now: 'Now',
  stamps: 'Stamp wall',
  webrings: 'Webrings',
  endorsements: 'Skills',
  counter: 'Visitor counter',
};

/** The kinds rendered by the lazy P05 module bundle rather than inline. */
export const PLUS_MODULE_KINDS = [
  'top-four',
  'now',
  'stamps',
  'webrings',
  'endorsements',
  'counter',
] as const satisfies readonly ModuleKind[];
export type PlusModuleKind = (typeof PLUS_MODULE_KINDS)[number];

export function isPlusModuleKind(kind: string): kind is PlusModuleKind {
  return (PLUS_MODULE_KINDS as readonly string[]).includes(kind);
}
