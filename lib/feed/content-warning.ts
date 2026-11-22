/**
 * Content warning reasons (sprint 06 #16) - the pure half, shared by the composers, the renderers and the server.
 *
 * A post can carry a reason beside `isSensitive`: plain text, one line, at most 80 characters ("Spoilers: Dune Part
 * Two", "Injury photo"). A reason implies the warning and covers the post's text as well as its media; a warning without
 * one covers media only, exactly as before. Covering is a presentation rule: a server path that can show the text to a
 * viewer who can reveal it sends the text and the reason together and lets the client cover it. A surface that cannot
 * be revealed (RSS, a notification preview, a link-preview card) leaves the text out and shows the reason instead.
 *
 * No zod here: client code imports it. Copy lives in the `content-warnings` namespace; the one English sentence this
 * module builds is a default for server surfaces that have no catalog (a stored notification preview).
 */

/** The longest reason, in characters. */
export const MAX_CONTENT_WARNING_LENGTH = 80;

// Unicode "Other, control" (C0, DEL, C1) and the line and paragraph separators.
const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]+/gu;

/** One reason as stored: plain text on a single line, control characters turned into spaces, trimmed, capped. */
export function sanitizeContentWarning(raw: string): string {
  return [...raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()]
    .slice(0, MAX_CONTENT_WARNING_LENGTH)
    .join('')
    .trim();
}

/** Whether a reason, as typed, is acceptable: not blank, no line breaks, within the limit. */
export function isValidContentWarning(raw: string): boolean {
  if (CONTROL_CHARS.test(raw)) {
    CONTROL_CHARS.lastIndex = 0;
    return false;
  }
  CONTROL_CHARS.lastIndex = 0;
  const clean = raw.trim();
  return clean.length > 0 && [...clean].length <= MAX_CONTENT_WARNING_LENGTH;
}

/**
 * A reason field as typed in a composer: blank is fine (no reason), anything else must be a valid reason. `reason` is
 * the value to send (trimmed) or null.
 */
export function checkContentWarningInput(raw: string): { ok: boolean; reason: string | null } {
  if (raw.trim() === '') return { ok: true, reason: null };
  return isValidContentWarning(raw) ? { ok: true, reason: raw.trim() } : { ok: false, reason: null };
}

/** The reason to render, or null when there is none (an empty or blank value is no reason). */
export function contentWarningOrNull(reason: string | null | undefined): string | null {
  const clean = typeof reason === 'string' ? reason.trim() : '';
  return clean === '' ? null : clean;
}

/** The warning a post is stored with. */
export interface ContentWarningFields {
  isSensitive: boolean;
  contentWarning: string | null;
}

/**
 * The pair to store from what a client sent. A reason implies the warning; clearing the warning (`isSensitive: false`)
 * clears the reason; a blank reason is no reason, and a warning without one stays valid.
 */
export function normalizeContentWarning(input: {
  isSensitive?: boolean | null | undefined;
  contentWarning?: string | null | undefined;
}): ContentWarningFields {
  const reason =
    typeof input.contentWarning === 'string'
      ? contentWarningOrNull(sanitizeContentWarning(input.contentWarning))
      : null;
  if (input.isSensitive === false) return { isSensitive: false, contentWarning: null };
  if (reason) return { isSensitive: true, contentWarning: reason };
  return { isSensitive: input.isSensitive === true, contentWarning: null };
}

/**
 * The warning a post edit leaves on the post. `undefined` = not sent (unchanged), `null` reason = remove the reason
 * (the warning itself stays unless `isSensitive: false` is sent too), `isSensitive: false` = clear both.
 */
export function resolveEditedContentWarning(args: {
  existing: ContentWarningFields;
  nextSensitive: boolean | undefined;
  nextReason: string | null | undefined;
}): ContentWarningFields {
  const { existing, nextSensitive, nextReason } = args;
  if (nextSensitive === false) return { isSensitive: false, contentWarning: null };
  if (nextReason !== undefined) {
    // A reason turns the warning on; removing it leaves the warning as it was (a warning without a reason is valid).
    const next = normalizeContentWarning({ contentWarning: nextReason });
    return next.contentWarning ? next : { isSensitive: nextSensitive ?? existing.isSensitive, contentWarning: null };
  }
  if (nextSensitive === true) return { isSensitive: true, contentWarning: existing.contentWarning };
  return existing;
}

/** The post columns the rule reads. */
export interface ContentWarningSubject {
  isSensitive?: boolean | null;
  contentWarning?: string | null;
  /** The author's id, so an author is never covered from their own post. */
  userId?: string | null;
}

/** Who is looking: the signed-in member (null when signed out) and their "show warned posts" preference. */
export interface ContentWarningViewer {
  userId?: string | null;
  showWarned?: boolean;
}

/** What a surface does with a warned post. */
export interface AppliedContentWarning {
  /** The reason, or null (a warning may have none). */
  reason: string | null;
  /** The post carries a warning at all. */
  warned: boolean;
  /** The text (and, with it, the media) is covered until revealed: a reason exists and the viewer has not opted out. */
  coverText: boolean;
  /** The media is covered until revealed: a warning exists and the viewer has not opted out. */
  coverMedia: boolean;
  /** The reason is shown as a plain label above the uncovered post. */
  showLabel: boolean;
}

/**
 * How a post's warning applies to this viewer. The author is never covered from their own post, and a reader who chose
 * "Show them" is not covered either; the reason still shows as a label. A post without a reason covers media only.
 */
export function applyContentWarning(
  post: ContentWarningSubject,
  viewer: ContentWarningViewer = {},
): AppliedContentWarning {
  const reason = contentWarningOrNull(post.contentWarning);
  const warned = !!post.isSensitive || reason !== null;
  if (!warned) return { reason: null, warned: false, coverText: false, coverMedia: false, showLabel: false };
  const exempt = viewer.showWarned === true || (!!viewer.userId && viewer.userId === post.userId);
  return {
    reason,
    warned: true,
    coverText: reason !== null && !exempt,
    coverMedia: !exempt,
    showLabel: reason !== null && exempt,
  };
}

/** The English default of "Content warning: {{reason}}", for a server surface that cannot translate (notification previews, cards). */
export function contentWarningNotice(reason: string): string {
  return `Content warning: ${reason}`;
}

/**
 * The text of a surface that cannot be revealed (a notification preview, a link-preview description, a card): the
 * reason in place of the text when the post has one, otherwise the text as before.
 */
export function previewTextFor(post: { content?: string | null; contentWarning?: string | null }): string | null {
  const reason = contentWarningOrNull(post.contentWarning);
  if (reason) return contentWarningNotice(reason);
  return post.content ?? null;
}

/**
 * Every server file that returns a post's text to someone other than its author, and so must carry the reason with it
 * (FR-5). `lib/feed/__tests__/content-warning-read-paths.test.ts` scans each for `contentWarning`.
 *
 * Reads that the client covers (the viewer can reveal them) send the text and the reason together: the feed mapping and
 * its cached-page reconcile, the post and profile reads, bookmarks, a community challenge entry, the embed, scheduled
 * publish, and the developer API (which passes the text through and adds `sensitive` and `contentWarning`). Surfaces
 * that cannot be revealed leave the text out for a post with a reason: RSS, notification previews and the link-preview
 * cards and meta tags.
 */
export const CONTENT_WARNING_READ_PATHS: readonly string[] = [
  // The feed and the post reads: the client covers them, so they carry the reason with the text.
  'lib/feed/map-feed-item.server.ts',
  'lib/feed/timeline.ts',
  'lib/feed/page-reconcile.server.ts',
  'lib/feed/api/rmharks.server.ts',
  'lib/feed/api/rmharks.$id.server.ts',
  'lib/profile/api/profile.$id.rmharks.server.ts',
  'lib/bookmarks.server.ts',
  'lib/scheduled/list.server.ts',
  'lib/scheduled/create.server.ts',
  'lib/scheduled/publish.server.ts',
  // The developer API passes the text through and adds `sensitive` and `contentWarning`.
  'lib/api/serializers.server.ts',
  'app/routes/api/v1/feed.ts',
  'lib/api/v1/search.server.ts',
  'lib/api/v1/communities.server.ts',
  'lib/api/v1/feeds.server.ts',
  'app/routes/api/v1/posts.ts',
  'app/routes/api/v1/posts/$id.ts',
  'app/routes/api/v1/users/$handle/posts.ts',
  'app/routes/api/v1/me/bookmarks.ts',
  // Surfaces that cannot be revealed leave the text out for a post with a reason.
  'lib/feed/rss.server.ts',
  'lib/feed/rss-community.server.ts',
  'lib/og/post-visibility.ts',
  'lib/og/api/og.post.$id.server.ts',
  'lib/og/api/og.post.$id.story.server.ts',
  'app/routes/_site/u/$userid/post/$postid.tsx',
  'app/routes/embed.post.$id.tsx',
  'lib/api/routes/embed.oembed.server.ts',
  'lib/search/posts.server.ts',
  'lib/communities/challenge.server.ts',
  'lib/saves/saves.server.ts',
  'lib/lists/lists.server.ts',
  'lib/discovery/trending.server.ts',
  'lib/discovery/today.server.ts',
  'lib/discovery/surprise.server.ts',
  'lib/discovery/jobs.server.ts',
  'lib/digest/assemble.server.ts',
  // Notification previews.
  'lib/social/engagement.server.ts',
  'lib/feed/api/rmharks.$id.repost.server.ts',
  'lib/feed/notify-mentions.server.ts',
  'lib/discovery/watch.server.ts',
  'lib/discovery/alerts.server.ts',
];

/**
 * Files that read a post's text, are not in `CONTENT_WARNING_READ_PATHS`, and are right not to be, each with the reason.
 * The source scan fails a file that selects a post's `content` and is in neither list.
 */
export const CONTENT_WARNING_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'app/routes/api/rmharks/$id/similar.ts':
    'reads one post to find similar ones, and returns them through the feed mapper, which carries the reason',
  'app/routes/api/rmharks/$id/unlock.ts':
    'returns the text to the member who just paid; the card already carries the reason and the client covers it',
  'app/routes/api/v1/posts/$id/comments.ts': 'comments, which have no warnings; it reads the post only to check access',
  'lib/admin/lookup.server.ts': 'staff lookup of a member’s own posts',
  'lib/admin/sweeps.server.ts': 'staff sweep preview of one member’s posts, shown only to the admin removing them',
  'lib/ai/api/ai.bio.server.ts': 'the author’s own posts, summarised for their bio',
  'lib/ai/api/rmharks.$id.translate.server.ts':
    'viewer-requested translation of a post the viewer has opened and revealed',
  'lib/ai/recap.server.ts': 'the author’s own posts in their own recap',
  'lib/analytics.server.ts': 'the author’s own post analytics',
  'lib/bulk/bulk.server.ts': 'the author’s own bulk actions',
  'lib/communities/automod.server.ts': 'moderation rules matched against text, nothing is returned to readers',
  'lib/communities/rules.server.ts': 'moderation rules matched against text, nothing is returned to readers',
  'lib/context-notes/notes.server.ts': 'reads text to check a note’s relevance, nothing is returned to readers',
  'lib/feed/alt-text-edit.server.ts': 'the author’s own describe-after-posting dialog',
  'lib/feed/api/ai.ask-feed.server.ts': 'a viewer-requested summary of posts the viewer can open',
  'lib/feed/api/rmharks.$id.comment.server.ts': 'comments, which have no warnings',
  'lib/feed/api/rmharks.$id.history.server.ts': 'the edit history dialog, opened on a post the viewer has revealed',
  'lib/feed/api/rmharks.$id.summary.server.ts':
    'a viewer-requested summary of a post the viewer has opened and revealed',
  'lib/feed/api/rmharks.ai-generate.server.ts': 'the author’s own drafting assistant',
  'lib/feed/conversation-controls.server.ts': 'reads text only to decide who may reply, returns none',
  'lib/feeds/feeds.server.ts':
    'custom feeds match on text and return posts through the feed mapper, which carries the reason',
  'lib/moderation/content.server.ts': 'moderator queue, where the text is the evidence',
  'lib/moderation/my-reports.server.ts': 'the reporter’s own reports',
  'lib/moderation/triage.server.ts': 'moderator queue, where the text is the evidence',
  'lib/rmhark-ai/bot-worker.server.ts': 'bots reading their own and mentioned posts to reply',
  'lib/search/indexer.server.ts': 'builds the search index; results are shaped in lib/search/posts.server.ts',
  'lib/trash/trash.server.ts': 'the author’s own trash',
  'lib/wrapped/wrapped.server.ts': 'the author’s own year in review',
};
