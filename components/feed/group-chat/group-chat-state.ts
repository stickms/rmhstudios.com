/**
 * Pure state for the group chat thread (A6): message/poll types and the
 * transforms the thread applies to its message list — de-duplicated append,
 * optimistic reaction toggle and poll vote, poll payload, scroll-stick rule.
 * No React, no I/O.
 */
import type { ReactionRow } from '@/lib/social/reactions';

export interface Sender {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

export interface Poll {
  question: string;
  options: { text: string; votes: number }[];
  totalVotes: number;
  myVote: number | null;
}

export interface Msg {
  id: string;
  content: string;
  createdAt: string;
  sender: Sender;
  gifUrl?: string | null;
  imageUrls?: string[];
  poll?: Poll | null;
  reactions?: ReactionRow[];
  /** P04 — message kind (text when absent), structured payload, forward hops, thread replies, expiry. */
  kind?: string;
  meta?: unknown;
  forwardCount?: number;
  replyCount?: number;
  expiresAt?: string | null;
}

export interface Group {
  id: string;
  name: string;
  isOwner: boolean;
  members: Sender[];
  messages: Msg[];
}

export interface PollDraft {
  question: string;
  options: string[];
}

export const MAX_IMAGES = 4;
export const MAX_POLL_OPTIONS = 6;
/** Within this many px of the bottom the thread keeps following new messages. */
export const STICK_TO_BOTTOM_PX = 120;

/** Appends messages whose ids are new; returns `prev` itself when none are. */
export function appendUnique(prev: Msg[], incoming: Msg[]): Msg[] {
  const have = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !have.has(m.id));
  if (!fresh.length) return prev;
  return [...prev, ...fresh];
}

/** Toggles the viewer's reaction row on one message (its own inverse). */
export function toggleReactionRow(
  messages: Msg[],
  messageId: string,
  emoji: string,
  userId: string,
): Msg[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const rows = m.reactions ?? [];
    const mine = rows.some((r) => r.emoji === emoji && r.userId === userId);
    return {
      ...m,
      reactions: mine
        ? rows.filter((r) => !(r.emoji === emoji && r.userId === userId))
        : [...rows, { emoji, userId }],
    };
  });
}

/** Optimistically moves the viewer's vote to `optionIdx`. */
export function applyOptimisticVote(messages: Msg[], messageId: string, optionIdx: number): Msg[] {
  return messages.map((m) => {
    if (m.id !== messageId || !m.poll) return m;
    const prevVote = m.poll.myVote;
    if (prevVote === optionIdx) return m;
    const options = m.poll.options.map((o, i) => {
      let votes = o.votes;
      if (i === optionIdx) votes += 1;
      if (i === prevVote) votes -= 1;
      return { ...o, votes };
    });
    const totalVotes = prevVote === null ? m.poll.totalVotes + 1 : m.poll.totalVotes;
    return { ...m, poll: { ...m.poll, options, totalVotes, myVote: optionIdx } };
  });
}

/** The poll to send: needs a question and at least two non-blank options. */
export function buildPollPayload(draft: PollDraft | null): PollDraft | null {
  if (!draft) return null;
  if (!draft.question.trim() || draft.options.filter((o) => o.trim()).length < 2) return null;
  return {
    question: draft.question.trim(),
    options: draft.options.map((o) => o.trim()).filter(Boolean),
  };
}

/** Chat members get priority in @-mention autocomplete. */
export function memberSuggestions(members: Sender[]) {
  return members.map((m) => ({
    id: m.id,
    name: m.name,
    image: m.image,
    handle: m.handle,
    username: m.handle,
  }));
}

/** Display name for a member id, or null when they are not in the chat. */
export function memberDisplayName(members: Sender[], userId: string): string | null {
  const mem = members.find((x) => x.id === userId);
  return mem ? mem.name || mem.handle : null;
}

/** Whether the viewer is close enough to the bottom to keep following. */
export function isNearBottom(el: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
}
