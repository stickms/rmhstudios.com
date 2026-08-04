/**
 * The "What's new" release registry.
 *
 * `WhatsNewModal` used to hardcode one release: three `<article>`s written
 * inline, a literal `26 / 01`, and a storage key with the release name baked
 * into it. Announcing the next thing meant editing the component and
 * remembering to bump the key — and forgetting the key means nobody who saw the
 * last announcement ever sees the new one, which fails silently and in the
 * direction you don't notice.
 *
 * So the release is data now. Shipping an announcement is: add an entry, point
 * `CURRENT_RELEASE` at it, add its copy in `releaseCopy()`. The storage key is
 * derived from the id, so it cannot be forgotten.
 *
 * ## What belongs in here
 *
 * Only things a user can actually go and do. A "what's new" card for a feature
 * with no UI is worse than no card: people click it, find nothing, and trust
 * the next one less. Backend that has landed ahead of its interface waits for
 * the interface.
 */

/** Stable ids, one per announced item. Copy lives in the component. */
export type WhatsNewItemId =
  'voice-calls' | 'upload-privacy' | 'translations' | 'membership-features';

export interface Release {
  /**
   * Stable id. Also the storage-key suffix, so a new release is automatically
   * unseen for everyone who saw the previous one.
   */
  id: string;
  /** Shown in the corner. Free-form — it is a label, not a semver. */
  version: string;
  /** The cards, in order. Two to four; the grid is built for that range. */
  items: readonly WhatsNewItemId[];
}

export const CURRENT_RELEASE: Release = {
  id: 'calls-and-packs',
  version: '26 / 02',
  // Three, deliberately: the layout is proven at three and every one of these
  // is something a user can go and do today. Emoji/sticker packs and voice
  // messages are built server-side but have no interface yet, so they are not
  // announced — see the note at the top of this file.
  items: ['voice-calls', 'upload-privacy', 'translations'],
};

/** Where "seen" is recorded. Derived, so it can't drift from the release. */
export function storageKeyFor(release: Release): string {
  return `rmh-whatsnew-seen-${release.id}-v1`;
}

/** Two-digit card numbers, so the copy doesn't have to carry them. */
export function itemNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/**
 * Grid columns for a card count.
 *
 * Spelled out rather than interpolated: Tailwind scans source statically, so a
 * computed `sm:grid-cols-${n}` produces a class that is never generated and the
 * cards silently stack.
 */
export function gridClassFor(count: number): string {
  switch (count) {
    case 2:
      return 'grid-cols-1 sm:grid-cols-2';
    case 4:
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
    default:
      return 'grid-cols-1 sm:grid-cols-3';
  }
}
