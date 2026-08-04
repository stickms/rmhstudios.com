/**
 * Server half of H1 — edit, unsend, and delete-for-me on direct messages.
 *
 * Every rule that matters is enforced here, not in the route handlers, so the
 * DM route and any future group-chat route cannot disagree about what "the edit
 * window" means:
 *
 * - **Edit**: sender only, 15 minutes, prior text snapshotted first.
 * - **Unsend**: sender only, any time, **tombstone** — the row keeps its content
 *   in the database and the read path redacts it, so a `ContentReport` against
 *   the message is still reviewable afterwards.
 * - **Delete for me**: a `DirectMessageHide` row, which is the only shape that
 *   lets the two sides of a conversation disagree about what is in it.
 *
 * Both mutating operations publish on the DM bus (`lib/message-events.ts`) with
 * the already-redacted body plus enough context to patch the conversation-list
 * preview, because a retraction that only lands in the open thread leaves the
 * inbox showing the text that was retracted.
 */

import { prisma } from '@/lib/prisma.server';
import { notifyUser, type MessageMutationPayload } from '@/lib/message-events';
import {
  DELETED_BY_SENDER,
  editEligibility,
  refusalMessage,
  refusalStatus,
  unsendEligibility,
  validateEditedBody,
  type EditRefusal,
  type UnsendRefusal,
} from '@/lib/messages/edit-policy';
import {
  applyHides,
  conversationPreview,
  toMessageView,
  type MessageView,
} from '@/lib/messages/message-view';
import { recordPriorRevision } from '@/lib/messages/edit-history.server';

/** Columns every read path needs. One list so no route forgets `deletedAt`. */
const messageSelect = {
  id: true,
  senderId: true,
  content: true,
  read: true,
  createdAt: true,
  gifUrl: true,
  imageUrls: true,
  editedAt: true,
  deletedAt: true,
  deletedBy: true,
  audioUrl: true,
  audioDurationMs: true,
  audioPeaks: true,
} as const;

export interface Participants {
  participantOneId: string;
  participantTwoId: string;
}

export type MutationFailure = {
  ok: false;
  status: number;
  error: string;
  reason: EditRefusal | UnsendRefusal | 'not-found' | 'forbidden';
};

function failure(
  reason: EditRefusal | UnsendRefusal | 'not-found' | 'forbidden',
  status?: number,
  error?: string,
): MutationFailure {
  if (reason === 'not-found') {
    return { ok: false, status: 404, error: error ?? 'Message not found', reason };
  }
  if (reason === 'forbidden') {
    return { ok: false, status: 403, error: error ?? 'Forbidden', reason };
  }
  return {
    ok: false,
    status: status ?? refusalStatus(reason),
    error: error ?? refusalMessage(reason),
    reason,
  };
}

/** The conversation, if `userId` is one of its two participants. */
export async function loadParticipantConversation(
  conversationId: string,
  userId: string,
): Promise<Participants | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantOneId: true, participantTwoId: true },
  });
  if (!conversation) return null;
  if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
    return null;
  }
  return conversation;
}

export function otherParticipant(conversation: Participants, userId: string): string {
  return conversation.participantOneId === userId
    ? conversation.participantTwoId
    : conversation.participantOneId;
}

/** Ids of messages this viewer chose to hide, restricted to one page of rows. */
async function hiddenIdsFor(userId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await prisma.directMessageHide.findMany({
    where: { userId, messageId: { in: messageIds } },
    select: { messageId: true },
  });
  return new Set(rows.map((r) => r.messageId));
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface ThreadPage {
  messages: MessageView[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * One page of a conversation, projected for `userId`.
 *
 * This is the viewer-scoped read the client uses instead of the older
 * `GET /api/messages/$conversationId`: that one predates edit/unsend/hide and
 * returns raw columns, so it would hand a participant the text of a message
 * that had been unsent.
 *
 * Returns `null` when the caller is not a participant — indistinguishable from
 * "no such conversation", which is the correct answer to give a stranger.
 */
export async function loadThreadPage(args: {
  conversationId: string;
  userId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ThreadPage | null> {
  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return null;

  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
  const rows = await prisma.directMessage.findMany({
    where: { conversationId: args.conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    select: { ...messageSelect, reactions: { select: { emoji: true, userId: true } } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Hides are applied AFTER the page is cut, not as a `NOT IN` in the query: the
  // cursor has to stay stable, and a page that shrinks by two hidden rows is
  // correct, whereas a cursor that skipped them is not resumable.
  const hidden = await hiddenIdsFor(
    args.userId,
    page.map((m) => m.id),
  );
  const visible = applyHides(page, hidden);

  return {
    messages: visible.reverse().map((row) => toMessageView(row)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore,
  };
}

/**
 * Messages in this conversation whose edit/tombstone state changed after
 * `since`.
 *
 * The catch-up path: a client that was offline, backgrounded, or simply not
 * subscribed when the mutation was published asks for everything it missed
 * instead of refetching the whole thread. Bounded to 100 rows — beyond that a
 * full reload is cheaper than a diff.
 */
export async function listMutationsSince(args: {
  conversationId: string;
  userId: string;
  since: Date;
}): Promise<{ messages: MessageView[]; hiddenIds: string[] } | null> {
  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return null;

  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: args.conversationId,
      OR: [{ editedAt: { gt: args.since } }, { deletedAt: { gt: args.since } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: messageSelect,
  });

  const hides = await prisma.directMessageHide.findMany({
    where: { userId: args.userId, createdAt: { gt: args.since } },
    select: { messageId: true },
  });

  const hidden = new Set(hides.map((h) => h.messageId));
  return {
    messages: applyHides(rows, hidden).map((row) => toMessageView(row)),
    hiddenIds: [...hidden],
  };
}

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/** Is this the newest message in the conversation? Decides preview patching. */
async function isLatestMessage(conversationId: string, messageId: string): Promise<boolean> {
  const latest = await prisma.directMessage.findFirst({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return latest?.id === messageId;
}

async function publishMutation(
  type: 'message-edited' | 'message-deleted',
  args: {
    conversation: Participants;
    actorId: string;
    row: {
      id: string;
      conversationId: string;
      content: string;
      editedAt: Date | null;
      deletedAt: Date | null;
      deletedBy: string | null;
      gifUrl: string | null;
      imageUrls: string[];
      audioUrl: string | null;
    };
  },
): Promise<MessageMutationPayload> {
  const view = toMessageView({ ...args.row, senderId: args.actorId, createdAt: new Date() });
  const mutation: MessageMutationPayload = {
    conversationId: args.row.conversationId,
    messageId: args.row.id,
    content: view.content,
    editedAt: view.editedAt,
    deletedAt: view.deletedAt,
    deletedBy: view.deletedBy,
    isLatest: await isLatestMessage(args.row.conversationId, args.row.id),
    preview: conversationPreview(args.row),
  };

  // Both participants, not just the other one: the actor may have the thread
  // open in a second tab, and an edit that lands in one tab only is the same
  // bug from the other direction.
  notifyUser(args.conversation.participantOneId, { type, mutation });
  if (args.conversation.participantTwoId !== args.conversation.participantOneId) {
    notifyUser(args.conversation.participantTwoId, { type, mutation });
  }
  return mutation;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type EditResult =
  { ok: true; message: MessageView; mutation: MessageMutationPayload } | MutationFailure;

/**
 * Edit a message's text within the window.
 *
 * Only the text changes. Media (images, GIF, audio) is immutable — replacing the
 * attachment of a message someone has already seen is not an edit, it is a
 * different message, and the "edited" marker would understate it.
 */
export async function editDirectMessage(args: {
  conversationId: string;
  messageId: string;
  userId: string;
  content: string;
  now?: Date;
}): Promise<EditResult> {
  const now = args.now ?? new Date();
  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return failure('not-found', 404, 'Conversation not found');

  const existing = await prisma.directMessage.findFirst({
    where: { id: args.messageId, conversationId: args.conversationId },
    select: messageSelect,
  });
  if (!existing) return failure('not-found');

  const eligible = editEligibility(existing, args.userId, now.getTime());
  if (!eligible.ok) return failure(eligible.reason);

  const content = args.content.trim();
  const bodyOk = validateEditedBody(
    {
      content,
      gifUrl: existing.gifUrl,
      imageUrls: existing.imageUrls,
      audioUrl: existing.audioUrl,
    },
    { content: existing.content },
  );
  if (!bodyOk.ok) return failure(bodyOk.reason);

  // Snapshot BEFORE the overwrite, exactly as `RMHarkEdit` does for posts.
  // Awaited so the window cannot close on a message whose prior text was never
  // captured; it degrades to a no-op rather than throwing.
  await recordPriorRevision(existing.id, existing.content, now).catch(() => {});

  const updated = await prisma.directMessage.update({
    where: { id: existing.id },
    data: { content, editedAt: now },
    select: { ...messageSelect, conversationId: true },
  });

  const mutation = await publishMutation('message-edited', {
    conversation,
    actorId: args.userId,
    row: { ...updated, conversationId: args.conversationId },
  });

  return { ok: true, message: toMessageView(updated), mutation };
}

export type UnsendResult =
  { ok: true; message: MessageView; mutation: MessageMutationPayload } | MutationFailure;

/**
 * Unsend (delete for everyone).
 *
 * Writes `deletedAt`/`deletedBy` and **leaves every content column intact**.
 * That is not laziness — it is the requirement: a reported message must stay
 * readable to moderators after its author retracts it, or unsend becomes the
 * fastest way to destroy the evidence in a report. Redaction happens on the read
 * path (`toMessageView`), which is also what guarantees a participant can never
 * receive the text by taking a different route to the row.
 */
export async function unsendDirectMessage(args: {
  conversationId: string;
  messageId: string;
  userId: string;
  now?: Date;
}): Promise<UnsendResult> {
  const now = args.now ?? new Date();
  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return failure('not-found', 404, 'Conversation not found');

  const existing = await prisma.directMessage.findFirst({
    where: { id: args.messageId, conversationId: args.conversationId },
    select: messageSelect,
  });
  if (!existing) return failure('not-found');

  const eligible = unsendEligibility(existing, args.userId);
  if (!eligible.ok) return failure(eligible.reason);

  const updated = await prisma.directMessage.update({
    where: { id: existing.id },
    data: { deletedAt: now, deletedBy: DELETED_BY_SENDER },
    select: messageSelect,
  });

  // Reactions point at content that is gone; they would render as a response to
  // a tombstone. Removed here rather than filtered on read so the rows do not
  // accumulate against a message nobody can see.
  await prisma.directMessageReaction
    .deleteMany({ where: { messageId: existing.id } })
    .catch(() => ({ count: 0 }));

  const mutation = await publishMutation('message-deleted', {
    conversation,
    actorId: args.userId,
    row: { ...updated, conversationId: args.conversationId },
  });

  return { ok: true, message: toMessageView(updated), mutation };
}

export type HideResult = { ok: true; hidden: boolean } | MutationFailure;

/**
 * "Delete for me" — a per-viewer hide, invisible to the other participant.
 *
 * No realtime publish: by definition nothing changed for anyone else. The row is
 * keyed `(messageId, userId)` so re-hiding is idempotent.
 */
export async function setMessageHidden(args: {
  conversationId: string;
  messageId: string;
  userId: string;
  hidden: boolean;
}): Promise<HideResult> {
  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return failure('not-found', 404, 'Conversation not found');

  const exists = await prisma.directMessage.findFirst({
    where: { id: args.messageId, conversationId: args.conversationId },
    select: { id: true },
  });
  if (!exists) return failure('not-found');

  if (args.hidden) {
    await prisma.directMessageHide.upsert({
      where: { messageId_userId: { messageId: args.messageId, userId: args.userId } },
      create: { messageId: args.messageId, userId: args.userId },
      update: {},
    });
  } else {
    await prisma.directMessageHide
      .delete({
        where: { messageId_userId: { messageId: args.messageId, userId: args.userId } },
      })
      .catch(() => null);
  }

  return { ok: true, hidden: args.hidden };
}
