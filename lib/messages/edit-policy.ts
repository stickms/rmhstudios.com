/**
 * When a direct message may be edited, unsent, or hidden — the pure half.
 *
 * Client-safe on purpose (no `.server` suffix): the composer needs the same
 * answer the API route enforces, or the menu offers an "Edit" that the server
 * then refuses. One module, imported by both, so the two cannot drift.
 *
 * ## Why a window at all
 *
 * An unbounded edit turns a conversation into a document one party can rewrite:
 * the recipient reads something, replies to it, and the sentence they replied to
 * changes underneath them. Fifteen minutes covers the reason people actually
 * reach for edit — a typo, a wrong number, an autocorrect — and stops well short
 * of "rewrite yesterday". Unsend has **no** window, because its reason (I sent
 * this to the wrong person / this contains something private) does not expire.
 *
 * The window is enforced server-side. These predicates exist so the UI agrees
 * with the server, not so the UI becomes the gate.
 */

/** Sender may edit for this long after sending. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60_000;

/** `DirectMessage.content` is `VarChar(2000)`. */
export const MESSAGE_MAX_LENGTH = 2000;

/** `deletedBy` is `VarChar(12)`. Both values fit. */
export const DELETED_BY_SENDER = 'sender';
export const DELETED_BY_MODERATOR = 'moderator';

export type EditRefusal =
  | 'not-sender'
  /** Past {@link MESSAGE_EDIT_WINDOW_MS}. */
  | 'window-expired'
  /** Already unsent — a tombstone has no text to edit. */
  | 'deleted'
  /** The edit would leave nothing behind (no text, no media, no audio). */
  | 'empty'
  | 'too-long'
  /** Byte-identical to what is already stored. */
  | 'unchanged';

export type UnsendRefusal = 'not-sender' | 'deleted';

export interface EditableMessage {
  senderId: string;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface MessageBodyParts {
  content: string;
  gifUrl?: string | null;
  imageUrls?: string[] | null;
  audioUrl?: string | null;
}

export type PolicyResult<R extends string> = { ok: true } | { ok: false; reason: R };

function ms(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Milliseconds of edit window left; `0` once it has closed. */
export function editWindowRemainingMs(createdAt: Date | string, now: number = Date.now()): number {
  return Math.max(0, ms(createdAt) + MESSAGE_EDIT_WINDOW_MS - now);
}

/**
 * May `viewerId` edit this message *at all* right now? Body validation is
 * separate ({@link validateEditedBody}) so the UI can decide whether to offer
 * the action before it knows the new text.
 */
export function editEligibility(
  message: EditableMessage,
  viewerId: string,
  now: number = Date.now(),
): PolicyResult<EditRefusal> {
  if (message.senderId !== viewerId) return { ok: false, reason: 'not-sender' };
  if (message.deletedAt) return { ok: false, reason: 'deleted' };
  if (editWindowRemainingMs(message.createdAt, now) <= 0) {
    return { ok: false, reason: 'window-expired' };
  }
  return { ok: true };
}

/** Convenience for rendering the menu. */
export function canEdit(
  message: EditableMessage,
  viewerId: string,
  now: number = Date.now(),
): boolean {
  return editEligibility(message, viewerId, now).ok;
}

/**
 * Unsend is sender-only and never expires. Re-unsending an already-tombstoned
 * message is refused rather than treated as a no-op so a double-tap cannot
 * silently rewrite `deletedAt` (and with it the moderation clock).
 */
export function unsendEligibility(
  message: EditableMessage,
  viewerId: string,
): PolicyResult<UnsendRefusal> {
  if (message.senderId !== viewerId) return { ok: false, reason: 'not-sender' };
  if (message.deletedAt) return { ok: false, reason: 'deleted' };
  return { ok: true };
}

/**
 * The message must still say something after the edit.
 *
 * A voice note keeps its audio, so clearing the accompanying text note is
 * legitimate — that is why the check is "is anything left" rather than "is the
 * text non-empty".
 */
export function validateEditedBody(
  next: MessageBodyParts,
  previous: MessageBodyParts,
): PolicyResult<EditRefusal> {
  const content = next.content.trim();
  if (content.length > MESSAGE_MAX_LENGTH) return { ok: false, reason: 'too-long' };

  const hasBody =
    content.length > 0 || !!next.gifUrl || (next.imageUrls?.length ?? 0) > 0 || !!next.audioUrl;
  if (!hasBody) return { ok: false, reason: 'empty' };

  if (content === previous.content.trim()) return { ok: false, reason: 'unchanged' };
  return { ok: true };
}

/** HTTP status for each refusal, so every route answers identically. */
export function refusalStatus(reason: EditRefusal | UnsendRefusal): number {
  switch (reason) {
    case 'not-sender':
      return 403;
    case 'deleted':
      return 409;
    case 'window-expired':
      return 403;
    default:
      return 400;
  }
}

/**
 * English fallback for a refusal. The UI translates via a literal `t()` key —
 * this exists for the API response body, which is not localized (matching every
 * other route on the site).
 */
export function refusalMessage(reason: EditRefusal | UnsendRefusal): string {
  switch (reason) {
    case 'not-sender':
      return 'You can only change your own messages.';
    case 'window-expired':
      return 'Messages can only be edited for 15 minutes after sending.';
    case 'deleted':
      return 'This message was already deleted.';
    case 'empty':
      return 'Message cannot be empty.';
    case 'too-long':
      return `Message cannot be longer than ${MESSAGE_MAX_LENGTH} characters.`;
    case 'unchanged':
      return 'No change.';
    default:
      return 'Invalid input';
  }
}
