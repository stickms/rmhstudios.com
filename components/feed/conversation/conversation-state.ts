/**
 * Pure thread logic — the transformations ConversationView applies to its
 * message list, kept free of React so each rule is unit-testable
 * (`conversation-state.test.ts`).
 */
import type { ReactionRow } from '@/lib/social/reactions';
import type { PollView } from '@/lib/chat-plus/types';
import type { SentVoiceMessage } from '@/lib/messages/voice.contract';

export interface Message {
  id: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  gifUrl?: string | null;
  imageUrls?: string[];
  reactions?: ReactionRow[];
  /** H1 — non-null once edited; the bubble renders an "edited" marker. */
  editedAt?: string | null;
  /** H1 — non-null once unsent; the bubble becomes a tombstone. */
  deletedAt?: string | null;
  deletedBy?: string | null;
  /** H2 — voice note. */
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioPeaks?: number[];
  /** P04 — message kind (text when absent), structured payload, forward hops, expiry, DM poll. */
  kind?: string;
  meta?: unknown;
  forwardCount?: number;
  expiresAt?: string | null;
  poll?: PollView | null;
}

/** The shape `message-edited` / `message-deleted` carry on the DM bus. */
export interface MessageMutation {
  conversationId: string;
  messageId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface OtherUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  isBot?: boolean;
}

export const MAX_DM_IMAGES = 4;

/**
 * Floor between catch-up syncs.
 *
 * The shared SSE stream emits an unread pulse for every DM notification —
 * including the edit/unsend ones — so that pulse is the signal that *something*
 * changed. Reacting to it directly would mean a request per delivered message,
 * hence the floor: mutations are rare, and a second of latency on an edit is
 * invisible next to the event path that normally carries it.
 */
export const MUTATION_SYNC_INTERVAL_MS = 1200;

/** An optimistic bubble has no server id yet. */
export function isTempId(id: string): boolean {
  return id.startsWith('temp-');
}

/** Apply an edit or a tombstone to the local copy of one message. */
export function applyMutationTo(prev: Message[], mutation: MessageMutation): Message[] {
  return prev.map((m) => {
    if (m.id !== mutation.messageId) return m;
    const tombstoned = !!mutation.deletedAt;
    return {
      ...m,
      content: mutation.content,
      editedAt: mutation.editedAt,
      deletedAt: mutation.deletedAt,
      deletedBy: mutation.deletedBy,
      // A tombstone drops its media and its reactions — they refer to
      // something the viewer can no longer see.
      ...(tombstoned
        ? {
            gifUrl: null,
            imageUrls: [],
            audioUrl: null,
            audioDurationMs: null,
            audioPeaks: [],
            reactions: [],
          }
        : {}),
    };
  });
}

/** One message as the catch-up endpoint reports it. */
export interface SyncPatch {
  id: string;
  content: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  gifUrl?: string | null;
  imageUrls?: string[] | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  audioPeaks?: number[] | null;
}

/** Drop messages the viewer hid and patch the ones that changed. */
export function applySyncPatches(
  prev: Message[],
  hidden: Set<string>,
  patches: Map<string, SyncPatch>,
): Message[] {
  return prev
    .filter((m) => !hidden.has(m.id))
    .map((m) => {
      const patch = patches.get(m.id);
      if (!patch) return m;
      return {
        ...m,
        content: patch.content,
        editedAt: patch.editedAt ?? null,
        deletedAt: patch.deletedAt ?? null,
        deletedBy: patch.deletedBy ?? null,
        gifUrl: patch.gifUrl ?? null,
        imageUrls: patch.imageUrls ?? [],
        audioUrl: patch.audioUrl ?? null,
        audioDurationMs: patch.audioDurationMs ?? null,
        audioPeaks: patch.audioPeaks ?? [],
        // Reactions are not part of a mutation payload; keep the ones we
        // have unless the message became a tombstone.
        ...(patch.deletedAt ? { reactions: [] } : {}),
      };
    });
}

/** Toggle the viewer's reaction row on one message (optimistic, on raw rows). */
export function toggleReactionRow(
  prev: Message[],
  messageId: string,
  emoji: string,
  myId: string,
): Message[] {
  return prev.map((m) => {
    if (m.id !== messageId) return m;
    const rows = m.reactions ?? [];
    const mine = rows.some((r) => r.emoji === emoji && r.userId === myId);
    return {
      ...m,
      reactions: mine
        ? rows.filter((r) => !(r.emoji === emoji && r.userId === myId))
        : [...rows, { emoji, userId: myId }],
    };
  });
}

/** Append a message unless one with the same id is already there. */
export function appendUnique(prev: Message[], msg: Message): Message[] {
  return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
}

/** Re-insert a hidden message in chronological position. */
export function insertSorted(prev: Message[], msg: Message): Message[] {
  return [...prev, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The text a swipe-to-reply drops into the composer, ahead of the draft. */
export function quotePrefix(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  const quoted = line.length > 80 ? `${line.slice(0, 80)}…` : line;
  return `> ${quoted}\n`;
}

/**
 * The message suggested replies would answer: the newest one, only when it is
 * theirs, carries text, and has not been unsent. Null renders no chips at all.
 */
export function replyTargetId(messages: Message[], viewerId: string | undefined): string | null {
  const newest = messages[messages.length - 1];
  return newest && newest.senderId !== viewerId && !newest.deletedAt && newest.content.trim()
    ? newest.id
    : null;
}

/**
 * Context for AI inline autocomplete. Tombstoned and voice-only messages
 * contribute nothing, so a retracted line cannot be fed back to the model that
 * suggests the next one.
 */
export function suggestionContext(
  messages: Message[],
  viewerId: string | undefined,
  otherName: string | null | undefined,
): Array<{ author: string; content: string }> {
  return messages
    .filter((m) => !m.deletedAt && m.content.trim().length > 0)
    .map((m) => ({
      author: m.senderId === viewerId ? 'Me' : otherName || 'Them',
      content: m.content,
    }));
}

/** The viewer's latest message, which is the one that carries "Seen". */
export function lastOwnMessageId(
  shown: Message[],
  viewerId: string | undefined,
): string | undefined {
  return [...shown].reverse().find((m) => m.senderId === viewerId)?.id;
}

/** A message from the shared SSE stream, narrowed to the fields the thread keeps. */
export function fromStreamMessage(msg: Message): Message {
  return {
    id: msg.id,
    content: msg.content,
    senderId: msg.senderId,
    read: msg.read,
    createdAt: msg.createdAt,
    gifUrl: msg.gifUrl,
    imageUrls: msg.imageUrls,
    editedAt: msg.editedAt ?? null,
    deletedAt: msg.deletedAt ?? null,
    audioUrl: msg.audioUrl ?? null,
    audioDurationMs: msg.audioDurationMs ?? null,
    audioPeaks: msg.audioPeaks ?? [],
    kind: msg.kind,
    meta: msg.meta,
    forwardCount: msg.forwardCount,
    expiresAt: msg.expiresAt ?? null,
    poll: msg.poll ?? null,
  };
}

/** A just-sent voice note as a thread message. */
export function fromVoiceMessage(message: SentVoiceMessage): Message {
  return {
    id: message.id,
    content: message.content,
    senderId: message.senderId,
    read: message.read,
    createdAt: message.createdAt,
    audioUrl: message.audioUrl,
    audioDurationMs: message.audioDurationMs,
    audioPeaks: message.audioPeaks ?? [],
    imageUrls: [],
    reactions: [],
  };
}

/** Whether a day divider belongs between two consecutive messages. */
export function shouldShowDateSeparator(msg: Message, prevMsg: Message | null): boolean {
  if (!prevMsg) return true;
  const d1 = new Date(msg.createdAt).toDateString();
  const d2 = new Date(prevMsg.createdAt).toDateString();
  return d1 !== d2;
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Which label a day divider carries: relative to now, or a calendar date. */
export function dateSeparatorKind(
  dateStr: string,
  now: Date = new Date(),
): { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; text: string } {
  const d = new Date(dateStr);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return { kind: 'today' };
  if (d.toDateString() === yesterday.toDateString()) return { kind: 'yesterday' };
  return {
    kind: 'date',
    text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
}
