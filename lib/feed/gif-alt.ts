/**
 * GIF descriptions (sprint 06 #15) - the pure half, shared by the composers, the renderers and the server.
 *
 * A post or message that carries a GIF can carry `gifAlt` beside `gifUrl`: plain text, one line, the same limit as an
 * image description. The picker hands over the provider's own description and the composer prefills it, so
 * describing a GIF costs nothing. An empty or absent description renders as the word "GIF" (a translated string that
 * lives in the `gif-descriptions` namespace, so this module returns data, never copy).
 *
 * No zod here: client code imports it.
 */
import { MAX_IMAGE_ALT_LENGTH } from '@/lib/rmhark-limits';

/** The same limit as an image description. */
export const MAX_GIF_ALT_LENGTH = MAX_IMAGE_ALT_LENGTH;

// Unicode "Other, control" (C0, DEL, C1) and the line and paragraph separators.
const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]+/gu;

/** One description as stored: plain text on a single line, control characters turned into spaces, trimmed, capped. */
export function sanitizeGifAlt(raw: string): string {
  return raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_GIF_ALT_LENGTH).trim();
}

/**
 * The value to store beside a GIF: null when there is no GIF (a description never outlives its picture), when the
 * description is absent, or when it is blank once cleaned.
 */
export function normalizeGifAlt(gifUrl: string | null | undefined, gifAlt: string | null | undefined): string | null {
  if (!gifUrl || typeof gifAlt !== 'string') return null;
  const clean = sanitizeGifAlt(gifAlt);
  return clean === '' ? null : clean;
}

/** What the composer prefills from the provider's text: cleaned and capped, '' when the provider sent none. */
export function prefillGifAlt(providerDescription: string | null | undefined): string {
  return typeof providerDescription === 'string' ? sanitizeGifAlt(providerDescription) : '';
}

/** The description to render, or null when the GIF is undescribed (the caller shows the translated "GIF"). */
export function gifAltOrNull(gifAlt: string | null | undefined): string | null {
  const clean = typeof gifAlt === 'string' ? gifAlt.trim() : '';
  return clean === '' ? null : clean;
}

/** True when a GIF is attached without a description (the alt-text reminder treats it like an undescribed image). */
export function gifMissingAlt(gifUrl: string | null | undefined, gifAlt: string | null | undefined): boolean {
  return !!gifUrl && gifAltOrNull(gifAlt) === null;
}

/**
 * The description a post edit leaves on the post. A new GIF starts from the description sent with it (the picker's
 * text, as edited), never from the old GIF's; removing the GIF removes its description; a description sent on its
 * own replaces the current one; otherwise the stored one stays.
 */
export function resolveEditedGifAlt(args: {
  existingUrl: string | null;
  existingAlt: string | null;
  /** The edit's `gifUrl`: undefined = not sent (unchanged), null = remove the GIF. */
  nextUrl: string | null | undefined;
  /** The edit's `gifAlt`: undefined = not sent, null = clear it. */
  nextAlt: string | null | undefined;
}): { gifUrl: string | null; gifAlt: string | null } {
  const gifUrl = args.nextUrl === undefined ? args.existingUrl : args.nextUrl;
  if (!gifUrl) return { gifUrl: null, gifAlt: null };
  const changedGif = gifUrl !== args.existingUrl;
  if (args.nextAlt !== undefined) return { gifUrl, gifAlt: normalizeGifAlt(gifUrl, args.nextAlt) };
  return { gifUrl, gifAlt: changedGif ? null : args.existingAlt };
}

/** What the picker passes to `onSelect`. */
export interface GifSelection {
  url: string;
  description: string;
}

/**
 * Every server file that returns a post's or message's `gifUrl` to a reader, and so must return `gifAlt` with it
 * (FR-6). `lib/feed/__tests__/gif-alt-read-paths.test.ts` scans each for `gifAlt`.
 *
 * Posts: the feed mapping and its cached-page reconcile, the post and profile reads, bookmarks, a community
 * challenge entry, the post page's meta, the embed, and the developer API. Messages: the history and send endpoints
 * for direct and group chats, voice sends, forwards and slash-command posts, scheduled posts and messages, and the
 * live-event payloads that carry a new message to an open client.
 */
export const GIF_ALT_READ_PATHS: readonly string[] = [
  'lib/feed/map-feed-item.server.ts',
  'lib/feed/timeline.ts',
  'lib/feed/quoted-original.ts',
  'lib/feed/page-reconcile.server.ts',
  'lib/feed/api/rmharks.server.ts',
  'lib/feed/api/rmharks.$id.server.ts',
  'lib/feed/alt-text-edit.server.ts',
  'lib/profile/api/profile.$id.rmharks.server.ts',
  'lib/bookmarks.server.ts',
  'lib/communities/challenge.server.ts',
  'lib/scheduled/list.server.ts',
  'lib/scheduled/publish.server.ts',
  'lib/scheduled/api/scheduled.server.ts',
  'lib/messages/message-view.ts',
  'lib/messages/send.server.ts',
  'lib/messages/mutations.server.ts',
  'lib/messages/voice.server.ts',
  'lib/messages/scheduled.server.ts',
  'lib/messages/api/messages.server.ts',
  'lib/messages/api/messages.$conversationId.server.ts',
  'lib/group-chat/serialize.server.ts',
  'lib/group-chat/api/group-chats.$id.messages.server.ts',
  'lib/chat-plus/post.server.ts',
  'lib/chat-plus/forward.server.ts',
  'lib/message-events.ts',
  'lib/group-events.ts',
  'app/routes/embed.post.$id.tsx',
  'app/routes/_site/u/$userid/post/$postid.tsx',
  'app/routes/api/internal/notify-message.ts',
  'app/routes/api/v1/posts.ts',
  'app/routes/api/v1/posts/$id.ts',
  'app/routes/api/v1/feed.ts',
  'lib/api/v1/communities.server.ts',
  'app/routes/api/v1/users/$handle/posts.ts',
  'app/routes/api/v1/me/bookmarks.ts',
  'lib/api/serializers.server.ts',
];

/**
 * Files under `lib/` and `app/routes/` that mention `gifUrl` and deliberately do NOT return `gifAlt`, each with
 * the reason. The scan fails any other `gifUrl` file that has no `gifAlt`, so a new read path has to be decided on.
 */
export const GIF_ALT_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/unfurl/oembed.contract.ts': 'resolves a Tenor share link to a media URL; not a posted GIF',
  'lib/api/routes/oembed.server.ts': 'resolves a Tenor share link to a media URL; not a posted GIF',
  'app/routes/api/rmhtube/oembed.ts': 'resolves a Tenor share link to a media URL for RMHTube chat; not a posted GIF',
  'lib/rmhark-ai/gif.server.ts': 'finds a GIF for the AI composer; the picker flow supplies the description',
  'lib/ai/catch-up.server.ts': 'summarises a message as the text "[GIF]"; the image is not shown',
  'lib/communities/automod.ts': 'classifies a post kind from whether it has a GIF; no GIF is shown',
  'lib/posts-plus/capsules.server.ts': 'a capsule row says it has a GIF (hasGif); the GIF is not shown until it opens',
  'lib/og/post-image.server.tsx': 'OG cards do not change (the card draws the picture, not an alt)',
  'lib/og/api/og.post.$id.server.ts': 'OG cards do not change (the card draws the picture, not an alt)',
  'lib/messages.server.ts': 'the inbox row shows the "GIF" preview label for a last message, never the GIF',
  'lib/messages/api/messages.search.server.ts': 'the inbox search row shows the "GIF" preview label, never the GIF',
  'lib/messages/requests.ts': 'decides whether a request message may carry media; reads no GIF',
  'lib/messages/edit-policy.ts': 'edit eligibility: whether a message still has a body; reads no GIF',
  'lib/messages/alt-edit.server.ts':
    'describe-after-sending for messages covers images only; a GIF is described when sent',
  'lib/chat-plus/flags.ts': 'attachment flags for the shared-media tabs; reads no GIF',
  'lib/chat-plus/media.server.ts':
    'the shared-media grid lists thumbnails by type; images have no description there either',
  'lib/chat-plus/pins.server.ts': 'a pinned-message row says it has media (hasMedia); the media is not shown',
  'lib/chat-plus/saved.server.ts': 'a saved-message row checks for media to build its label; the media is not shown',
};
