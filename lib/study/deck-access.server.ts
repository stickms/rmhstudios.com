/**
 * The one access rule for a flashcard deck (s11-10). `deckRole(userId, deckId)` answers `'owner'`, `'editor'` (an
 * accepted `DeckEditor` row, whose owner has not blocked or been blocked by them and who is not banned) or `null`.
 * Every card write calls it; a reader that filters in the database uses `studiedDeckWhere` / `readableDeckWhere`,
 * which say the same thing as a `where`. `DECK_ACCESS_PATHS` (`deck-access.ts`) lists every file that filters decks
 * by `userId`, and a source scan holds the list.
 *
 * A pending invitation gives no access, and neither does an expired or removed one: the row is the grant.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import type { DeckRole } from '@/lib/study/deck-access';

type Db = typeof prisma | Prisma.TransactionClient;

/** The viewer's role on one deck, or null when it is missing or theirs to neither own nor edit. */
export async function deckRole(userId: string, deckId: string, db: Db = prisma): Promise<DeckRole | null> {
  const deck = await db.flashcardDeck.findUnique({ where: { id: deckId }, select: { userId: true } });
  if (!deck) return null;
  if (deck.userId === userId) return 'owner';
  const row = await db.deckEditor.findUnique({
    where: { deckId_userId: { deckId, userId } },
    select: { status: true },
  });
  if (!row || row.status !== 'accepted') return null;
  // An editor acts among members: a block either way between them, or a ban, ends it.
  const blocked = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: deck.userId },
        { blockerId: deck.userId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (blocked) return null;
  const member = await db.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  if (member?.bannedUntil && member.bannedUntil.getTime() > Date.now()) return null;
  return 'editor';
}

/** `deckRole`, refused (null) unless the role is one of `allowed`. */
export async function requireDeckRole(
  userId: string,
  deckId: string,
  allowed: readonly DeckRole[],
  db: Db = prisma,
): Promise<DeckRole | null> {
  const role = await deckRole(userId, deckId, db);
  return role !== null && allowed.includes(role) ? role : null;
}

/**
 * An accepted `DeckEditor` row of `userId` whose member is not banned now (`bannedUntil` null or past): the editor
 * branch every filter shares, so it says what `deckRole` says. A hand-written `editors: { some: { userId … } }` is the
 * bug this closes (a banned co-editor kept the deck in their queue and statistics).
 */
export const activeEditorWhere = (userId: string, now: Date = new Date()) =>
  ({
    userId,
    status: 'accepted',
    user: { OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] },
  }) satisfies Prisma.DeckEditorWhereInput;

/**
 * `activeEditorWhere` as a raw SQL condition on the deck aliased `d` (the table `deck_editor`, the table `user`, and
 * their quoted camelCase columns, read from the schema's `@@map`): true when the member is an accepted editor of `d`
 * and not banned now.
 */
export const activeEditorSql = (userId: string) =>
  Prisma.sql`EXISTS (SELECT 1 FROM deck_editor e WHERE e."deckId" = d."id" AND e."userId" = ${userId} AND e."status" = 'accepted'
    AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."id" = e."userId" AND u."bannedUntil" > now()))`;

/** The decks a member studies and edits: their own and the ones they are an accepted editor of. */
export const studiedDeckWhere = (userId: string, now: Date = new Date()) =>
  ({
    OR: [{ userId }, { editors: { some: activeEditorWhere(userId, now) } }],
  }) satisfies Prisma.FlashcardDeckWhereInput;

/** A deck the member may read: a public one, their own, or one they edit. A deck made private drops out. */
export const readableDeckWhere = (userId: string, now: Date = new Date()) =>
  ({
    OR: [{ isPublic: true }, { userId }, { editors: { some: activeEditorWhere(userId, now) } }],
  }) satisfies Prisma.FlashcardDeckWhereInput;

/** Whether `userId` may read a deck row already loaded with its owner and visibility (by id: block and ban aware). */
export async function canReadDeck(
  userId: string,
  deck: { id: string; isPublic: boolean; userId: string },
  db: Db = prisma,
): Promise<boolean> {
  if (deck.isPublic || deck.userId === userId) return true;
  return (await deckRole(userId, deck.id, db)) !== null;
}
