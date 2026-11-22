/**
 * Every place the site writes an upload, and what the media sweep may do about it.
 *
 * The sweep deletes stored objects, so nothing is eligible until it has been classified here. A
 * surface is one of:
 *  - `swept`: `sweepUnreferencedMedia` (lib/media/sweep.server.ts) deletes its rows' objects by a
 *    NAMED rule that is in that file's query. The rule is listed, so a reader can find it.
 *  - `excluded`: its rows are written, but something still points at the object by URL, so the row
 *    sweep keeps it while that reference lasts (`referencedUrls` in sweep.server.ts, the sprint 08
 *    exclusions). The `keptBy` file is where the reference lives.
 *  - `not-recorded`: no `Media` row is written, so the row sweep never sees the object. `followUp`
 *    says what would cover it; until that exists the object stays.
 *
 * A surface is `swept` only when its release rule is proven in code. Anything uncertain is
 * `excluded` or `not-recorded`: when in doubt, keep. `POLICIES` (lib/media/ingest.server.ts) gaining
 * a key fails `lib/media/__tests__/sweep-surfaces.test.ts` until the key is classified here.
 */

/** The rules of `sweepUnreferencedMedia`'s selection, in the order of its `OR` branches. */
export const SWEEP_RULES = ['orphan-pending', 'soft-deleted-post', 'hard-deleted-post'] as const;
export type SweepRule = (typeof SWEEP_RULES)[number];

export type SweepSurface =
  | { kind: 'swept'; rules: readonly SweepRule[]; why: string }
  | { kind: 'excluded'; keptBy: string; why: string }
  | { kind: 'not-recorded'; followUp: string; why: string };

/** Keys: every `POLICIES` key, plus the writers outside the ingest door. */
export const MEDIA_SWEEP_SURFACES = {
  avatar: {
    kind: 'not-recorded',
    followUp: 'Record a Media row at upload, and release the old avatar when the member replaces it.',
    why: 'The avatar route calls ingest without `record`, and replaces the previous object itself.',
  },
  post: {
    kind: 'swept',
    rules: ['orphan-pending', 'soft-deleted-post', 'hard-deleted-post'],
    why: 'Feed uploads are PENDING until a post attaches them (lib/media/attach.server.ts), so each rule has a row to act on. The same URLs can be re-used by tables that claim no row (a post, an announcement, a chat message, a homes listing photo, an email campaign picture, a museum era screenshot); `referencedUrls` keeps any URL one of them still names.',
  },
  album: {
    kind: 'not-recorded',
    followUp: 'Album slides are owned by their album; releasing them belongs to deleting the album.',
    why: 'Admin album uploads call ingest without `record`.',
  },
  library: {
    kind: 'not-recorded',
    followUp: 'Record a Media row at upload, then release the cover with the book.',
    why: 'Library covers call ingest without `record`.',
  },
  build: {
    kind: 'excluded',
    keptBy: 'lib/media/sweep.server.ts (referencedUrls: buildScreenshot.url, userBuild.thumbnailUrl)',
    why: 'Build pictures stay PENDING for good; a screenshot or a cover that names the URL keeps the object, and one that no longer does lets the orphan rule take it.',
  },
  flashcard: {
    kind: 'excluded',
    keptBy: 'lib/media/sweep.server.ts (referencedUrls: flashcard.frontImageUrl, flashcard.backImageUrl)',
    why: 'Card pictures stay PENDING for good and copies share one object by URL; a card side that names it keeps it.',
  },
  'card-sound': {
    kind: 'excluded',
    keptBy: 'lib/media/sweep.server.ts (referencedUrls: flashcard.frontSoundUrl, flashcard.backSoundUrl)',
    why: 'Card sounds are claimed by compare-and-set when a card is saved and stay ATTACHED with no post; a card side that names one keeps it, and an upload no card claimed is reclaimed by the orphan rule. One object per side, never shared.',
  },
  chat: {
    kind: 'excluded',
    keptBy: 'none: no caller records chat rows',
    why: 'Chat shares the feed key space, but no code attaches its rows the way a post does, so nothing proves a chat picture unused. Kept.',
  },
  'persona-avatar': {
    kind: 'not-recorded',
    followUp: 'Release a persona avatar when the persona is deleted (lib/personas/avatar.server.ts).',
    why: 'Persona avatars are written straight to storage, with no Media row.',
  },
  pronunciation: {
    kind: 'not-recorded',
    followUp: 'media.clip-sweep (lib/media/clip-sweep.server.ts) deletes clips no ProfilePlus names, once a week old.',
    why: 'Pronunciation clips are one object per member at a fixed key; no Media row is written.',
  },
  emoji: {
    kind: 'excluded',
    keptBy: 'lib/media/sweep.server.ts (the hard-deleted-post rule needs attachedAt, which emoji items never get)',
    why: 'Emoji-pack items are ATTACHED with no post and no attachedAt, which no rule of the row sweep matches.',
  },
} as const satisfies Record<string, SweepSurface>;

export type SweepSurfaceKey = keyof typeof MEDIA_SWEEP_SURFACES;

/** The surfaces the sweep may delete from, with the rules that name them. */
export function sweptSurfaces(): SweepSurfaceKey[] {
  return (Object.keys(MEDIA_SWEEP_SURFACES) as SweepSurfaceKey[]).filter(
    (k) => (MEDIA_SWEEP_SURFACES[k] as SweepSurface).kind === 'swept',
  );
}
