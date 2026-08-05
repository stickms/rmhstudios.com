/**
 * "What did I miss?" — one-paragraph catch-up for a conversation (A6).
 * Server-only.
 *
 * The feature is small; the thing that makes it dangerous is not. Summarizing a
 * conversation means reading it, so this module's real job is **not** the model
 * call — it is refusing to read anything the caller could not have opened
 * themselves. Every one of the three surfaces therefore delegates its
 * permission decision to the check that already guards that surface's own read
 * path, rather than re-deriving one here:
 *
 *  - `thread` (a DM) → `loadThreadPage()` from `lib/messages/mutations.server`,
 *    which returns `null` for a non-participant *and* applies the tombstone /
 *    "delete for me" redaction. Summarizing the raw rows would have quietly
 *    resurrected the text of unsent messages — the exact bug that read path
 *    exists to prevent.
 *  - `group-chat` → the `groupChatMember` lookup every
 *    `/api/group-chats/$id/**` handler performs, then the shared
 *    `serializeGroupMessages()` projection.
 *  - `space` → `getSpace()`, the same public read the room page and
 *    `/api/spaces/$id` use. A Space is public by design; the gate that matters
 *    is `recordChat`, because without it messages were never persisted at all.
 *
 * A second-order rule follows from that: the model sees only what the *viewer*
 * sees. That is why the cache key is a hash of the transcript rather than the
 * conversation id — two viewers with different visible content get different
 * keys, and two viewers with identical visible content are safe to share an
 * answer.
 */

import { createHash } from 'node:crypto';
import { apiCache } from '@/lib/cache';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { asData, systemFor, CATCH_UP } from '@/lib/ai/prompts';
import { prisma } from '@/lib/prisma.server';
import { loadThreadPage } from '@/lib/messages/mutations.server';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import { getSpace } from '@/lib/spaces.server';

export type CatchUpKind = 'thread' | 'group-chat' | 'space';

export type CatchUpReason =
  /** Fewer than `MIN_ITEMS` messages — reading them is cheaper than a summary. */
  | 'too-short'
  /** Not a participant, or no such conversation. Deliberately the same answer. */
  | 'no-access'
  /** AI is switched off, or this Space never recorded its chat. */
  | 'unavailable';

export interface CatchUpResult {
  /** `null` whenever `reason` is set; never both. */
  summary: string | null;
  reason?: CatchUpReason;
  /** Messages considered. Lets the UI say "caught you up on 23 messages". */
  items: number;
  /** True when `apiCache` answered, so callers can reason about cost. */
  cached: boolean;
}

/**
 * Below this a summary is worse than the thing it summarizes: four messages fit
 * on screen, and a paragraph about them is strictly more to read.
 */
const MIN_ITEMS = 5;

/** One page. Beyond this the interesting part is "you missed a lot", not detail. */
const MAX_ITEMS = 100;

/** Ceiling on what reaches the model, independent of message count. */
const MAX_TRANSCRIPT_CHARS = 12_000;

/**
 * Ten minutes. Long enough that opening a busy thread twice costs one call,
 * short enough that a live conversation's summary is never meaningfully stale —
 * and in any case a new message changes the content hash, which invalidates the
 * entry outright rather than waiting for the TTL.
 */
const TTL_MS = 10 * 60_000;

/* -------------------------------------------------------------------------- */
/* Gathering                                                                  */
/* -------------------------------------------------------------------------- */

type Gathered = { ok: true; lines: string[] } | { ok: false; reason: CatchUpReason };

/** Collapse a message with no text into something a summarizer can use. */
function bodyOf(m: {
  content: string;
  audioUrl?: string | null;
  gifUrl?: string | null;
  imageUrls?: string[] | null;
}): string {
  const text = m.content.trim();
  if (text) return text;
  if (m.audioUrl) return '[voice message]';
  if (m.gifUrl) return '[GIF]';
  if (m.imageUrls?.length) return `[${m.imageUrls.length} image(s)]`;
  return '';
}

async function gatherThread(id: string, userId: string, since: Date | null): Promise<Gathered> {
  const page = await loadThreadPage({ conversationId: id, userId, limit: MAX_ITEMS });
  // `null` covers both "not a participant" and "no such conversation" — the
  // correct, indistinguishable answer to give a stranger.
  if (!page) return { ok: false, reason: 'no-access' };

  const lines = page.messages
    .filter((m) => !m.deletedAt)
    .filter((m) => !since || new Date(m.createdAt) > since)
    // A DM has exactly two participants, so "you"/"them" is unambiguous. Real
    // display names are withheld on purpose: they add nothing the prompt needs
    // (CATCH_UP leads with what changed, not who spoke) and every name omitted
    // is one less identifier leaving the platform.
    .map((m) => `${m.senderId === userId ? 'you' : 'them'}: ${bodyOf(m)}`)
    .filter((line) => !line.endsWith(': '));

  return { ok: true, lines };
}

async function gatherGroupChat(id: string, userId: string, since: Date | null): Promise<Gathered> {
  const membership = await prisma.groupChatMember.findUnique({
    where: { groupId_userId: { groupId: id, userId } },
    select: { id: true },
  });
  if (!membership) return { ok: false, reason: 'no-access' };

  const rows = await prisma.groupMessage.findMany({
    where: { groupId: id, ...(since ? { createdAt: { gt: since } } : {}) },
    // Newest-first then reversed: with a cap, the tail is what "what did I
    // miss" means. Ordering ascending would summarize the oldest 100 instead.
    orderBy: { createdAt: 'desc' },
    take: MAX_ITEMS,
    select: groupMessageSelect,
  });

  const messages = await serializeGroupMessages(rows.reverse(), userId);
  const lines = messages
    .map((m) => {
      const who = m.sender.id === userId ? 'you' : (m.sender.name ?? 'member');
      const body = m.poll ? `[poll] ${m.poll.question}` : bodyOf(m);
      return body ? `${who}: ${body}` : '';
    })
    .filter(Boolean);

  return { ok: true, lines };
}

async function gatherSpace(id: string, since: Date | null): Promise<Gathered> {
  const space = await getSpace(id);
  if (!space) return { ok: false, reason: 'no-access' };
  // Not a permission decision — `recordChat: false` means the socket handler
  // never wrote a row, so there is genuinely nothing to summarize.
  if (!space.recordChat) return { ok: false, reason: 'unavailable' };

  const rows = await prisma.spaceMessage.findMany({
    where: { spaceId: id, ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: MAX_ITEMS,
    select: { body: true, user: { select: { name: true, username: true } } },
  });

  const lines = rows
    .reverse()
    .map((r) => `${r.user.name ?? r.user.username ?? 'member'}: ${r.body.trim()}`)
    .filter((line) => !line.endsWith(': '));

  return { ok: true, lines };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export interface CatchUpArgs {
  kind: CatchUpKind;
  id: string;
  /** The viewer. Every access check and the usage ledger key off this. */
  userId: string;
  /** Only summarize messages after this instant (epoch ms). */
  sinceMs?: number;
}

/**
 * Summarize what `userId` missed, or explain why there is nothing to say.
 *
 * Never throws for an ordinary "no" — an absent conversation, a stranger, a
 * quiet thread and a disabled provider all come back as a `reason`, because
 * every one of them should render as a calm empty state rather than an error
 * toast. It *does* propagate `AppError` from `assertAiBudget` (402) and from
 * the provider (503): those are conditions the caller must surface with a
 * status, not swallow.
 */
export async function catchUp(args: CatchUpArgs): Promise<CatchUpResult> {
  const since = args.sinceMs ? new Date(args.sinceMs) : null;

  const gathered =
    args.kind === 'thread'
      ? await gatherThread(args.id, args.userId, since)
      : args.kind === 'group-chat'
        ? await gatherGroupChat(args.id, args.userId, since)
        : await gatherSpace(args.id, since);

  if (!gathered.ok) return { summary: null, reason: gathered.reason, items: 0, cached: false };

  const { lines } = gathered;
  if (lines.length < MIN_ITEMS) {
    return { summary: null, reason: 'too-short', items: lines.length, cached: false };
  }

  const transcript = lines.join('\n').slice(0, MAX_TRANSCRIPT_CHARS);

  // Keyed by *content*, not by conversation: a new message produces a new key
  // (so the summary is never stale), and the key cannot outlive the visibility
  // of the text it was derived from.
  const hash = createHash('sha256').update(transcript).digest('hex').slice(0, 32);
  const key = `ai:catch-up:${args.kind}:${args.id}:${hash}`;

  const cached = apiCache.get<string>(key);
  if (cached) return { summary: cached, items: lines.length, cached: true };

  // Checked after the cache so a hit costs nothing and is never refused, and
  // before the call so an exhausted budget stops the spend rather than
  // reporting it.
  if (!isAiConfigured()) {
    return { summary: null, reason: 'unavailable', items: lines.length, cached: false };
  }
  await assertAiBudget(args.userId);

  const raw = await runTask('summarize', systemFor(CATCH_UP), asData(transcript), {
    userId: args.userId,
    promptId: CATCH_UP.id,
    promptVer: CATCH_UP.version,
  });

  const summary = raw.trim().slice(0, CATCH_UP.maxChars);
  if (!summary) return { summary: null, reason: 'unavailable', items: lines.length, cached: false };

  apiCache.set(key, summary, TTL_MS);
  return { summary, items: lines.length, cached: false };
}
