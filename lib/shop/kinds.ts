/**
 * The store's categories, on their own (client-safe, no items).
 *
 * Split from the catalog so a route can validate `?kind=` without importing the catalog: route modules are imported
 * statically by the route tree, so a top-level import there lands on every page's critical path.
 */

export type ShopItemKind =
  'THEME' | 'SITE_THEME' | 'PET' | 'NAME_COLOR' | 'BADGE' | 'BANNER' | 'POST_FLAIR' | 'AVATAR_FRAME';

/** The store's category tabs, in order. */
export const KIND_ORDER: ShopItemKind[] = [
  'NAME_COLOR',
  'AVATAR_FRAME',
  'BADGE',
  'POST_FLAIR',
  'BANNER',
  'PET',
  'THEME',
  'SITE_THEME',
];
