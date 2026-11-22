/**
 * Suggested corrections to a public deck's cards (server-only, s10-04).
 *
 * A member who can read a deck (it is public, or they hold a copy of it) proposes a new front and back for one text
 * card; the deck's author decides. Accepting applies the text through `updateCardIn` in the same transaction as the
 * status change, so every copy gets it through deck sync (`cardsChangedAt`). Suggestions are private to the two members:
 * there is no public read path. Card sounds are never part of a suggestion (the patch carries none), and picture and
 * occlusion cards are out of scope: a card with pictures can be corrected in its text (its pictures stay as they are),
 * an occlusion card cannot be suggested to at all.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { CARD_IMAGE_SELECT } from '@/lib/study/card-images';
import { deleteCardImageObjects } from '@/lib/study/card-images.server';
import { isCardKind, validateCard, type CardKind } from '@/lib/study/card-types';
import { cardHash } from '@/lib/study/deck-sync';
import { updateCardIn } from '@/lib/study/deck-editor.server';
import {
  accountOldEnough,
  isSuggestable,
  MAX_OPEN_PER_DECK,
  MAX_OPEN_PER_MEMBER_DECK,
  normalizeSides,
  sameText,
  type AuthorSuggestion,
  type MySuggestion,
  type SuggestionRefusal,
  type SuggestionStatus,
} from '@/lib/study/suggestions';

export type SuggestResult<T = object> =
  ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409; reason: SuggestionRefusal };

const refuse = (status: 400 | 403 | 404 | 409, reason: SuggestionRefusal) => ({ ok: false, status, reason }) as const;

/** The notification entity type of all three notices; one label covers them. */
export const DECK_SUGGESTION_ENTITY = 'deck-suggestion';

/** The deck-wide lock and the per-member lock, in the one order they are always taken (deck first). */
export const deckSuggestLockKey = (deckId: string) => `deck-suggest:${deckId}`;
export const memberSuggestLockKey = (deckId: string, userId: string) => `deck-suggest:${deckId}:${userId}`;

/** Thrown inside a transaction to roll it back and carry the refusal out. */
class Refused extends Error {
  constructor(readonly result: { ok: false; status: 400 | 403 | 404 | 409; reason: SuggestionRefusal }) {
    super('refused');
  }
}

const asKind = (kind: string): CardKind => (isCardKind(kind) ? kind : 'basic');

/** Whether `userId` holds a copy of `deckId` (the deck stays readable to them even after it turned private). */
async function copyOf(userId: string, deckId: string): Promise<string | null> {
  const copy = await prisma.flashcardDeck.findFirst({ where: { userId, clonedFromId: deckId }, select: { id: true } });
  return copy?.id ?? null;
}

export interface CreateInput {
  cardId: string;
  front: string;
  back?: string | undefined;
  note?: string | undefined;
}

/**
 * Create a suggestion. Refused for the author, a member blocked either way, a banned or deletion-pending member, an account under 7 days
 * old, a deck that does not accept suggestions, a deck the member cannot read, an occlusion card, a suggestion that
 * changes nothing or repeats an open one, and past the caps: 20 open per member per deck, 200 open per deck. The caps
 * are checked under the deck lock and then the member lock.
 */
export async function createSuggestion(
  userId: string,
  deckId: string,
  input: CreateInput,
): Promise<SuggestResult<{ id: string }>> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { id: true, userId: true, title: true, isPublic: true, acceptsSuggestions: true },
  });
  if (!deck) return refuse(404, 'not-found');
  if (deck.userId === userId) return refuse(403, 'own-deck');

  // A private deck is readable only to someone who copied it, and then only through their own copy's card.
  const copyDeckId = deck.isPublic ? null : await copyOf(userId, deckId);
  if (!deck.isPublic && !copyDeckId) return refuse(404, 'not-found');
  if (!deck.acceptsSuggestions) return refuse(403, 'off');

  const suggester = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, bannedUntil: true, deletionScheduledAt: true },
  });
  if (!suggester) return refuse(404, 'not-found');
  const now = new Date();
  if (suggester.bannedUntil && suggester.bannedUntil.getTime() > now.getTime()) return refuse(403, 'banned');
  if (suggester.deletionScheduledAt) return refuse(403, 'banned');
  if (!accountOldEnough(suggester.createdAt, now)) return refuse(403, 'too-new');
  const blocked = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: deck.userId },
        { blockerId: deck.userId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) return refuse(403, 'blocked');

  const card = await prisma.flashcard.findFirst({
    where: { id: input.cardId, deckId, sourceId: null },
    select: { id: true, kind: true, front: true, back: true, ...CARD_IMAGE_SELECT },
  });
  if (!card) return refuse(404, 'not-found');
  if (!isSuggestable(card.kind)) return refuse(400, 'not-suggestable');

  // What "no change" is measured against: the public card, or for a deck that turned private the member's own copy.
  let reference: { front: string; back: string } = card;
  if (copyDeckId) {
    const mine = await prisma.flashcard.findFirst({
      where: { deckId: copyDeckId, originCardId: card.id, sourceId: null },
      select: { front: true, back: true },
    });
    if (!mine) return refuse(404, 'not-found');
    reference = mine;
  }

  const kind = asKind(card.kind);
  const checked = validateCard({ kind, front: input.front, back: input.back });
  if (!checked.ok) return refuse(400, 'invalid');
  const proposed = normalizeSides(checked.card);
  if (sameText(proposed, reference)) return refuse(400, 'no-change');
  const note = input.note?.trim() ? input.note.trim() : null;
  const baseHash = cardHash(card);

  try {
    const id = await prisma.$transaction(async (tx) => {
      await lockKey(tx, deckSuggestLockKey(deckId));
      await lockKey(tx, memberSuggestLockKey(deckId, userId));
      const open = await tx.deckSuggestion.count({ where: { deckId, status: 'open' } });
      if (open >= MAX_OPEN_PER_DECK) throw new Refused(refuse(409, 'deck-cap'));
      const mine = await tx.deckSuggestion.count({ where: { deckId, suggesterId: userId, status: 'open' } });
      if (mine >= MAX_OPEN_PER_MEMBER_DECK) throw new Refused(refuse(409, 'member-cap'));
      const same = await tx.deckSuggestion.findFirst({
        where: { deckId, cardId: card.id, status: 'open', front: proposed.front, back: proposed.back },
        select: { id: true },
      });
      if (same) throw new Refused(refuse(409, 'duplicate'));
      const row = await tx.deckSuggestion.create({
        data: {
          deckId,
          cardId: card.id,
          suggesterId: userId,
          front: proposed.front,
          back: proposed.back,
          note,
          baseHash,
        },
        select: { id: true },
      });
      return row.id;
    });
    await notifyAuthor(deck.userId, deck.id, deck.title);
    return { ok: true, id };
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

/** The author's open suggestions on a deck, oldest first, each against the card as it is now. */
export async function listForAuthor(
  userId: string,
  deckId: string,
): Promise<SuggestResult<{ suggestions: AuthorSuggestion[] }>> {
  const deck = await prisma.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: { id: true } });
  if (!deck) return refuse(404, 'not-found');
  const rows = await prisma.deckSuggestion.findMany({
    where: { deckId, status: 'open' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_OPEN_PER_DECK,
    select: {
      id: true,
      cardId: true,
      front: true,
      back: true,
      note: true,
      baseHash: true,
      createdAt: true,
      card: { select: { kind: true, front: true, back: true, ...CARD_IMAGE_SELECT } },
      suggester: { select: { id: true, name: true, profile: { select: { displayName: true } } } },
    },
  });
  return {
    ok: true,
    suggestions: rows.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      kind: asKind(r.card.kind),
      currentFront: r.card.front,
      currentBack: r.card.back,
      front: r.front,
      back: r.back,
      note: r.note,
      stale: cardHash(r.card) !== r.baseHash,
      createdAt: r.createdAt.toISOString(),
      suggester: { id: r.suggester.id, name: r.suggester.profile?.displayName ?? r.suggester.name ?? '' },
    })),
  };
}

/** The caller's own suggestions on a deck, newest first. Nothing about the deck beyond their own rows. */
export async function listMine(userId: string, deckId: string): Promise<MySuggestion[]> {
  const rows = await prisma.deckSuggestion.findMany({
    where: { deckId, suggesterId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    select: {
      id: true,
      cardId: true,
      front: true,
      back: true,
      note: true,
      status: true,
      declineReason: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    front: r.front,
    back: r.back,
    note: r.note,
    status: r.status as SuggestionStatus,
    declineReason: r.declineReason,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type Decision =
  | { decision: 'accept'; edit?: { front: string; back?: string | undefined } | undefined }
  | { decision: 'decline'; reason?: string | undefined; block?: boolean | undefined };

export interface Decided {
  status: 'accepted' | 'declined';
  /** Suggestions declined by this decision (more than one only for "Decline and block"). */
  declined: number;
}

/**
 * Decide one suggestion as the deck's author. The author check and the `status = 'open'` compare-and-set run inside the
 * transaction, so two accepts of one suggestion change the card once. Accept applies the (possibly edited) text through
 * `updateCardIn` in that same transaction: if the card no longer takes it, nothing is written.
 */
export async function decideSuggestion(
  userId: string,
  suggestionId: string,
  input: Decision,
): Promise<SuggestResult<Decided>> {
  const notices: { userId: string; deckId: string; title: string; accepted: boolean; reason: string | null }[] = [];
  const released: string[] = [];
  try {
    const result = await prisma.$transaction(async (tx): Promise<Decided> => {
      const row = await tx.deckSuggestion.findUnique({
        where: { id: suggestionId },
        select: {
          id: true,
          cardId: true,
          suggesterId: true,
          front: true,
          back: true,
          deck: { select: { id: true, userId: true, title: true } },
        },
      });
      if (!row || row.deck.userId !== userId) throw new Refused(refuse(404, 'not-found'));
      const now = new Date();

      if (input.decision === 'decline') {
        const reason = input.reason?.trim() ? input.reason.trim() : null;
        const won = await tx.deckSuggestion.updateMany({
          where: { id: row.id, status: 'open' },
          data: { status: 'declined', declineReason: reason, decidedAt: now },
        });
        if (won.count === 0) throw new Refused(refuse(409, 'already-decided'));
        let declined = 1;
        if (input.block) {
          const rest = await tx.deckSuggestion.updateMany({
            where: { suggesterId: row.suggesterId, status: 'open', deck: { userId } },
            data: { status: 'declined', decidedAt: now },
          });
          declined += rest.count;
        } else {
          notices.push({
            userId: row.suggesterId,
            deckId: row.deck.id,
            title: row.deck.title,
            accepted: false,
            reason,
          });
        }
        return { status: 'declined', declined };
      }

      // The card must still be a text card the author owns; an occlusion card never takes a suggestion's text.
      const card = await tx.flashcard.findFirst({
        where: { id: row.cardId, sourceId: null, deck: { userId } },
        select: { kind: true },
      });
      if (!card) throw new Refused(refuse(404, 'not-found'));
      if (!isSuggestable(card.kind)) throw new Refused(refuse(409, 'not-suggestable'));
      const won = await tx.deckSuggestion.updateMany({
        where: { id: row.id, status: 'open' },
        data: { status: 'accepted', decidedAt: now },
      });
      if (won.count === 0) throw new Refused(refuse(409, 'already-decided'));
      const front = input.edit ? input.edit.front : row.front;
      const back = input.edit ? (input.edit.back ?? '') : row.back;
      const applied = await updateCardIn(tx, userId, row.cardId, { front, back });
      if (!applied.ok)
        throw new Refused(refuse(applied.status === 404 ? 404 : 400, applied.status === 404 ? 'not-found' : 'invalid'));
      released.push(...applied.released);
      notices.push({
        userId: row.suggesterId,
        deckId: row.deck.id,
        title: row.deck.title,
        accepted: true,
        reason: null,
      });
      return { status: 'accepted', declined: 0 };
    });
    await deleteCardImageObjects(released);
    for (const n of notices) await notifySuggester(n);
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

/** The suggester takes back an open suggestion of their own. Compare-and-set on `open`. */
export async function withdrawSuggestion(userId: string, suggestionId: string): Promise<SuggestResult> {
  const won = await prisma.deckSuggestion.updateMany({
    where: { id: suggestionId, suggesterId: userId, status: 'open' },
    data: { status: 'withdrawn', decidedAt: new Date() },
  });
  if (won.count === 1) return { ok: true };
  const row = await prisma.deckSuggestion.findFirst({
    where: { id: suggestionId, suggesterId: userId },
    select: { id: true },
  });
  return row ? refuse(409, 'already-decided') : refuse(404, 'not-found');
}

/** "New suggestions on <deck>": one notice while an earlier one for the deck is unread. Best-effort. */
async function notifyAuthor(authorId: string, deckId: string, title: string): Promise<void> {
  try {
    await createNotification({
      userId: authorId,
      type: 'SYSTEM',
      entityType: DECK_SUGGESTION_ENTITY,
      entityId: deckId,
      preview: notice('deck-suggestions-new', { deck: title }),
      link: `/study/${deckId}/edit`,
      dedupeUnread: true,
    });
  } catch (error) {
    console.error('[deck-suggestions] could not notify the author', error);
  }
}

/** The suggester's notice: accepted, or not taken with the author's reason when given. Best-effort. */
async function notifySuggester(n: {
  userId: string;
  deckId: string;
  title: string;
  accepted: boolean;
  reason: string | null;
}): Promise<void> {
  try {
    await createNotification({
      userId: n.userId,
      type: 'SYSTEM',
      entityType: DECK_SUGGESTION_ENTITY,
      entityId: `${n.deckId}:${n.accepted ? 'accepted' : 'declined'}`,
      preview: n.accepted
        ? notice('deck-suggestion-accepted', { deck: n.title })
        : notice('deck-suggestion-declined', { deck: n.title, reason: n.reason ?? 'No reason was given.' }),
      link: '/study',
    });
  } catch (error) {
    console.error('[deck-suggestions] could not notify the suggester', error);
  }
}

/** The suggestions a member made, for their account export. */
export async function exportDeckSuggestions(userId: string) {
  const rows = await prisma.deckSuggestion.findMany({
    where: { suggesterId: userId },
    orderBy: { createdAt: 'asc' },
    select: {
      cardId: true,
      front: true,
      back: true,
      note: true,
      status: true,
      declineReason: true,
      createdAt: true,
      decidedAt: true,
      deck: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    deckTitle: r.deck.title,
    cardId: r.cardId,
    front: r.front,
    back: r.back,
    note: r.note,
    status: r.status,
    declineReason: r.declineReason,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  }));
}
