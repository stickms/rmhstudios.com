/**
 * Pure composer logic — everything ComposeBox decides that does not need React:
 * what a poll needs to be postable, the request body, the optimistic card, and
 * how a failed post is folded back into the box. Kept free of hooks so each
 * rule is unit-testable (`compose-state.test.ts`).
 */
import type { FeedItem } from '@/lib/feed-types';
import { MIN_POLL_OPTIONS } from '@/lib/rmhark-limits';

export const MAX_IMAGES = 4;

export type Attachment = 'poll' | 'gif' | null;
export type AudienceValue = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'CIRCLE';
export type ReplyControlValue = 'EVERYONE' | 'FOLLOWING' | 'MENTIONED';

export interface PollDraft {
  question: string;
  options: string[];
  multiSelect: boolean;
}

/** A fresh, empty poll. A new object each call — state must never share one. */
export function emptyPoll(): PollDraft {
  return { question: '', options: ['', ''], multiSelect: false };
}

/** Whether the poll attachment is complete enough to post. */
export function isPollPostable(attachment: Attachment, poll: PollDraft): boolean {
  return (
    attachment === 'poll' &&
    !!poll.question.trim() &&
    poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS
  );
}

export function isGifPostable(attachment: Attachment, gifUrl: string): boolean {
  return attachment === 'gif' && gifUrl.trim().length > 0;
}

export interface CanSubmitInput {
  hasContent: boolean;
  hasPoll: boolean;
  hasGif: boolean;
  hasImages: boolean;
  hasCodeEmbed: boolean;
  remaining: number;
  submitting: boolean;
  uploadingCount: number;
  missingAltCount: number;
}

export function computeCanSubmit(i: CanSubmitInput): boolean {
  return (
    (i.hasContent || i.hasPoll || i.hasGif || i.hasImages || i.hasCodeEmbed) &&
    i.remaining >= 0 &&
    !i.submitting &&
    i.uploadingCount === 0 &&
    i.missingAltCount === 0
  );
}

/** Why "Post as thread" is unavailable for an over-long draft, if it is. */
export function threadBlockedBy(i: {
  hasImages: boolean;
  hasGif: boolean;
  hasPoll: boolean;
  audience: AudienceValue;
  isSensitive: boolean;
  replyControl: ReplyControlValue;
  unlockPrice: string;
}): 'attachments' | 'options' | null {
  if (i.hasImages || i.hasGif || i.hasPoll) return 'attachments';
  if (
    i.audience !== 'PUBLIC' ||
    i.isSensitive ||
    i.replyControl !== 'EVERYONE' ||
    parseInt(i.unlockPrice, 10) > 0
  ) {
    return 'options';
  }
  return null;
}

/** Colour class for the remaining-characters counter. */
export function counterToneClass(remaining: number): string {
  return remaining <= 0
    ? 'text-site-danger'
    : remaining <= 20
      ? 'text-site-warning'
      : 'text-site-text-dim';
}

export interface ComposeBodyInput {
  content: string;
  hasPoll: boolean;
  poll: PollDraft;
  pollDuration: number;
  hasGif: boolean;
  gifUrl: string;
  hasImages: boolean;
  imageUrls: string[];
  imageAlts: string[];
  audience: AudienceValue;
  isSensitive: boolean;
  isTake: boolean;
  replyControl: ReplyControlValue;
  unlockPrice: string;
  communityId?: string;
  extraBody?: Record<string, unknown>;
  /** Field bags contributed by the posts-plus and code-embed features. */
  featureFields: Array<Record<string, unknown>>;
}

/** The `POST /api/rmharks` body for the composer's current contents. */
export function buildComposeBody(i: ComposeBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (i.content.trim()) body.content = i.content.trim();
  if (i.hasPoll) {
    body.poll = {
      question: i.poll.question.trim(),
      options: i.poll.options.filter((o) => o.trim()).map((o) => o.trim()),
      multiSelect: i.poll.multiSelect,
      ...(i.pollDuration > 0 ? { durationHours: i.pollDuration } : {}),
    };
  }
  if (i.hasGif) body.gifUrl = i.gifUrl.trim();
  if (i.hasImages) {
    body.imageUrls = i.imageUrls;
    // Only send alts when the author described at least one image; send the
    // full index-aligned array so the server can pair them by position.
    if (i.imageAlts.some((a) => a?.trim())) {
      body.imageAlts = i.imageUrls.map((_, idx) => i.imageAlts[idx]?.trim() ?? '');
    }
  }
  if (i.audience !== 'PUBLIC') body.audience = i.audience;
  if (i.isSensitive) body.isSensitive = true;
  if (i.isTake) body.isTake = true;
  if (i.replyControl !== 'EVERYONE') body.replyControl = i.replyControl;
  const price = parseInt(i.unlockPrice, 10);
  if (price > 0) body.unlockPrice = price;
  if (i.communityId) body.communityId = i.communityId;
  if (i.extraBody) Object.assign(body, i.extraBody);
  Object.assign(body, ...i.featureFields);
  return body;
}

export interface SessionUserShape {
  id: string;
  name?: string | null;
  image?: string | null;
  handle?: string | null;
  username?: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
}

export interface OptimisticItemInput {
  id: string;
  content: string;
  sessionUser: SessionUserShape;
  resolvedUser: { name?: string | null; image?: string | null; handle?: string | null } | null;
  hasImages: boolean;
  imageUrls: string[];
  imageAlts: string[];
  isSensitive: boolean;
  isTake: boolean;
  replyControl: ReplyControlValue;
  hasGif: boolean;
  gifUrl: string;
  hasPoll: boolean;
  poll: PollDraft;
  unlockPrice: string;
}

/**
 * The post the user *would* see, so it can appear at the top of the feed the
 * instant they hit Post — before the server has replied. The real record
 * (correct id, poll option ids, etc.) is swapped in on reconcile.
 */
export function buildOptimisticItem(i: OptimisticItemInput): FeedItem {
  const price = parseInt(i.unlockPrice, 10);
  const { sessionUser, resolvedUser, id } = i;
  return {
    id,
    type: 'rmhark',
    createdAt: new Date().toISOString(),
    content: i.content.trim() || undefined,
    user: {
      id: sessionUser.id,
      name: resolvedUser?.name ?? sessionUser.name ?? null,
      image: resolvedUser?.image ?? sessionUser.image ?? null,
      handle: resolvedUser?.handle ?? sessionUser.handle ?? null,
      username: sessionUser.username ?? null,
      isVerified: sessionUser.isVerified,
      isAdmin: sessionUser.isAdmin,
    },
    imageUrls: i.hasImages ? i.imageUrls : undefined,
    imageAlts: i.hasImages
      ? i.imageUrls.map((_, idx) => i.imageAlts[idx]?.trim() ?? '')
      : undefined,
    isSensitive: i.isSensitive,
    isTake: i.isTake || undefined,
    replyControl: i.replyControl,
    gifUrl: i.hasGif ? i.gifUrl.trim() : undefined,
    poll: i.hasPoll
      ? {
          id: `${id}-poll`,
          question: i.poll.question.trim(),
          multiSelect: i.poll.multiSelect,
          totalVotes: 0,
          options: i.poll.options
            .filter((o) => o.trim())
            .map((o, idx) => ({ id: `${id}-opt-${idx}`, text: o.trim(), voteCount: 0 })),
        }
      : undefined,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    liked: false,
    reposted: false,
    bookmarked: false,
    // The author always sees their own content, even a paid post.
    locked: false,
    unlockPrice: price > 0 ? price : undefined,
    pending: true,
  };
}

/**
 * Fold a failed post's text back into a box the user has already started
 * writing in: prepended, never overwriting.
 */
export function prependFailedContent(failed: string, current: string): string {
  return current.trim() ? `${failed}\n\n${current}` : failed;
}

/** Whether the composer is still as `resetForm` left it. */
export function isComposerEmpty(i: {
  content: string;
  attachment: Attachment;
  imageCount: number;
  gifUrl: string;
  hasCodeEmbed: boolean;
}): boolean {
  return (
    !i.content.trim() &&
    i.attachment === null &&
    i.imageCount === 0 &&
    !i.gifUrl.trim() &&
    !i.hasCodeEmbed
  );
}

/** New uploads appended after the existing ones, capped at the image limit. */
export function appendImages(prev: string[], added: string[]): string[] {
  return [...prev, ...added].slice(0, MAX_IMAGES);
}

/**
 * Set the alt text for one image. The array is padded so the edited index is
 * addressable even if earlier images have no description yet.
 */
export function setAltAt(prev: string[], index: number, value: string): string[] {
  const next = [...prev];
  while (next.length <= index) next.push('');
  next[index] = value;
  return next;
}

/** Drop element `index` (used to remove an image and its alt together). */
export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, j) => j !== index);
}
