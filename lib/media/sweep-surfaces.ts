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

/**
 * Every schema column that names a stored picture, sound or clip (a `String`, `String?` or `String[]` whose name ends
 * in image, images, imageUrl(s), thumbnailUrl, coverUrl, bannerUrl, mediaUrl(s), soundUrl or avatarUrl) is either named
 * as a field in a Prisma `where` inside `referencedUrls` (lib/media/sweep.server.ts, so the sweep keeps what it
 * points at) or listed here with a reason a reviewer can check. `lib/media/__tests__/sweep-reference-columns.test.ts`
 * reads the schema and fails a column that is in neither, an entry whose column is gone, and an entry the sweep now
 * names. Keyed `Model.field`. The sweep only ever deletes feed-space (`rmharks/`) and card-sound keys
 * (`SWEEPABLE_PREFIXES`), so a column that cannot hold one of those is safe; a column that can is not listed here
 * unless no `Media` row exists for it (a row-less object is never a sweep target).
 */
export const SWEEP_REFERENCE_EXEMPT: Readonly<Record<string, string>> = {
  'User.image': 'The sign-in provider avatar (a third-party address) or a `user-avatars/` object; never a feed key.',
  'UserProfile.customImage': 'The member avatar, in the `user-avatars/` key space (surface `avatar`, not recorded).',
  'UserProfile.bannerUrl': 'The profile banner, in the `user-banners/` key space the sweep never deletes from.',
  'AiPersona.avatarUrl':
    'The generated persona avatar, in the `personas/avatars/` key space (surface `persona-avatar`).',
  'Stamp.imageUrl':
    'A member stamp written straight to its own `stamps/` key (lib/profile/stamps.server.ts), no Media row.',
  'VibePage.thumbnailUrl':
    'A route path (`/api/vibe/thumb/<slug>`) over the `vibe-thumbs/` key space, not a feed object.',
  'BlogPost.image':
    'A blog cover an admin sets in the blog editor, whose uploads go to the `blog/` key space (BLOG_MEDIA_PREFIX).',
  'NewsArticle.image': 'The source article picture: a third-party address from the news pipeline, not stored here.',
  'Song.coverUrl':
    'Slice It song art: read by the game, written only by song imports (a source address); no feed upload is written here.',
  'ChartPack.coverUrl': 'Slice It pack art: read by the game; the app has no writer that records a feed upload here.',
  'EmojiPack.coverUrl':
    'Read only: nothing in the app writes it. Emoji items are ATTACHED with no post (surface `emoji`), which no sweep rule matches.',
  'PhotoNomination.imageUrl':
    'Written by `ingest(file, "post")` without `record` (lib/api/routes/photo-of-the-day.server.ts), so no Media row exists for the sweep to select.',
  'DoctrineSafehouseContent.mediaUrls':
    'No code path in the app writes it (admin tooling and seeds only); no Media row names these addresses.',
  'DoctrineDisclosure.mediaUrls': 'Same as `DoctrineSafehouseContent.mediaUrls`: no writer in the app, no Media row.',
  'RmhTubeQueueItem.thumbnailUrl': 'The thumbnail of a watched video, a third-party address given by the video source.',
  'RmhTubeTimedComment.mediaUrl':
    'The address of the video a comment is pinned to (a key to a watch, not an upload of this row).',
  'RmhTubeHeatBucket.mediaUrl':
    'The address of the video a bucket counts (a key to a watch, not an upload of this row).',
  'RmhTubeCommentaryTrack.mediaUrl': 'The address of the video a commentary track is synced to (a key, not an upload).',
  'HomeListing.aiImages': 'A subset of `HomeListing.images` (the write path filters it), which `referencedUrls` names.',
};
