/**
 * The one place that decides what a viewer is allowed to see of a message.
 *
 * ## Why a tombstone and not a delete
 *
 * Unsend removes the *content*, never the row. Two reasons, and both are the
 * whole point of the feature:
 *
 * 1. **Deleting the row makes unsend a gaslighting tool.** If a message can
 *    vanish without trace, one party can deny having said something and the
 *    conversation supports them. A tombstone keeps the fact that a message was
 *    there and who sent it, and only removes what it said.
 * 2. **A report has to survive it.** `ContentReport.entityType` already carries
 *    `'dm'`. If unsend hard-deleted, reporting abuse and then watching the
 *    abuser retract it would destroy the evidence — unsend would become the
 *    fastest way to erase a report. So the row keeps its original `content` in
 *    the database and *this* function is what hides it from the participants.
 *    Moderator reads pass `forModerator` and see the stored text.
 *
 * That split is why nothing else in the codebase may build a message payload by
 * hand: the redaction lives here, once, on the read path.
 *
 * Client-safe (no Prisma types, no `.server`), so the same shape can be asserted
 * in tests and reused by the client for optimistic updates.
 */

import { DELETED_BY_SENDER } from '@/lib/messages/edit-policy';

/** The columns this module reads. Structural, so a Prisma row satisfies it. */
export interface StoredMessage {
  id: string;
  senderId: string;
  content: string;
  read?: boolean;
  createdAt: Date | string;
  gifUrl?: string | null;
  imageUrls?: string[] | null;
  editedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  deletedBy?: string | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioPeaks?: number[] | null;
  reactions?: { emoji: string; userId: string }[];
}

/** What the client renders. `content` is already redacted where it must be. */
export interface MessageView {
  id: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: string;
  gifUrl: string | null;
  imageUrls: string[];
  /** Non-null once edited — the bubble renders an "edited" marker. */
  editedAt: string | null;
  /** Non-null once unsent — the bubble renders the tombstone. */
  deletedAt: string | null;
  /** `'sender'` | `'moderator'`. Lets the tombstone say *who* removed it. */
  deletedBy: string | null;
  audioUrl: string | null;
  audioDurationMs: number | null;
  audioPeaks: number[];
  reactions: { emoji: string; userId: string }[];
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface ViewOptions {
  /**
   * Moderator/report read. Keeps the stored content on a tombstoned row so a
   * `ContentReport` against an unsent message is still reviewable. Never set
   * this on a participant-facing route.
   */
  forModerator?: boolean;
}

/**
 * Project a stored row into what a participant may see.
 *
 * A tombstone keeps: id, sender, timestamps, and the fact of deletion.
 * A tombstone drops: text, GIF, images, audio (url, duration and waveform —
 * the peaks alone would still describe the rhythm of what was said), and
 * reactions, which no longer refer to anything.
 */
export function toMessageView(row: StoredMessage, opts: ViewOptions = {}): MessageView {
  const deletedAt = iso(row.deletedAt);
  const base: MessageView = {
    id: row.id,
    senderId: row.senderId,
    content: row.content,
    read: row.read ?? false,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    gifUrl: row.gifUrl ?? null,
    imageUrls: row.imageUrls ?? [],
    editedAt: iso(row.editedAt),
    deletedAt,
    deletedBy: row.deletedBy ?? null,
    audioUrl: row.audioUrl ?? null,
    audioDurationMs: row.audioDurationMs ?? null,
    audioPeaks: row.audioPeaks ?? [],
    reactions: row.reactions ?? [],
  };

  if (!deletedAt || opts.forModerator) return base;

  return {
    ...base,
    content: '',
    gifUrl: null,
    imageUrls: [],
    audioUrl: null,
    audioDurationMs: null,
    audioPeaks: [],
    reactions: [],
    deletedBy: base.deletedBy ?? DELETED_BY_SENDER,
  };
}

/** True when the row carries a voice note (after redaction). */
export function isVoiceMessage(view: Pick<MessageView, 'audioUrl'>): boolean {
  return !!view.audioUrl;
}

export type PreviewKind = 'deleted' | 'voice' | 'image' | 'gif' | 'text' | 'empty';

export interface ConversationPreview {
  kind: PreviewKind;
  /** Only ever the message's own text; empty for every non-text kind. */
  text: string;
}

/**
 * What the conversation list should show as the last line.
 *
 * Returns a *kind* rather than a sentence: the label for "Voice message" or
 * "This message was deleted" is a translated string, and translation belongs in
 * the component, not on the server. The list therefore renders
 * `t('dm-preview-voice', …)` from the kind and only ever prints `text` verbatim.
 */
export function conversationPreview(
  row: Pick<StoredMessage, 'content'> &
    Partial<Pick<StoredMessage, 'deletedAt' | 'audioUrl' | 'imageUrls' | 'gifUrl'>>,
): ConversationPreview {
  if (row.deletedAt) return { kind: 'deleted', text: '' };
  if (row.audioUrl) return { kind: 'voice', text: row.content?.trim() ?? '' };
  const trimmed = row.content?.trim() ?? '';
  if (trimmed) return { kind: 'text', text: trimmed };
  if ((row.imageUrls?.length ?? 0) > 0) return { kind: 'image', text: '' };
  if (row.gifUrl) return { kind: 'gif', text: '' };
  return { kind: 'empty', text: '' };
}

/**
 * Filter a page of rows for one viewer, dropping anything they chose to
 * "delete for me".
 *
 * Hides are deliberately **not** a column on the shared row: the two sides of a
 * conversation must be able to disagree about whether a message is in their
 * copy of it, which is exactly what `DirectMessageHide (messageId, userId)`
 * models. Passing the hidden-id set in (rather than querying here) keeps this
 * function pure and lets the caller fetch it in the same round trip as the page.
 */
export function applyHides<T extends { id: string }>(rows: T[], hiddenIds: Iterable<string>): T[] {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  if (hidden.size === 0) return rows;
  return rows.filter((row) => !hidden.has(row.id));
}
