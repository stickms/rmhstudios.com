/**
 * A moderator's takedown of a reported flashcard deck (s12-16).
 *
 * The takedown makes the deck private and stamps `moderatedAt`. The owner keeps the deck (and editors keep studying
 * it) but cannot make it public again: `updateDeck` in `deck-editor.server.ts` refuses `isPublic: true` while the
 * stamp stands, which is the one write the site PATCH and the developer API both call. Every reader of public decks
 * filters on `isPublic`, so a deck leaves the browse page, its page for others, copying and the profile at once.
 */
import { prisma } from '@/lib/prisma.server';

/** Take a deck down. Idempotent: a deck already taken down keeps its first stamp. Returns whether this call did it. */
export async function moderateDeck(deckId: string, now: Date = new Date()): Promise<boolean> {
  const done = await prisma.flashcardDeck.updateMany({
    where: { id: deckId, moderatedAt: null },
    data: { moderatedAt: now, isPublic: false },
  });
  return done.count === 1;
}

/**
 * The owner of a deck a member may report, for the report route: a deck that exists, is public and has not already
 * been taken down. Anything else is `null`, so the report flow never confirms a private deck exists.
 */
export async function deckReportAuthor(deckId: string): Promise<string | null> {
  const row = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { isPublic: true, moderatedAt: true, userId: true },
  });
  return row && row.isPublic && !row.moderatedAt ? row.userId : null;
}

/** Deck titles, for an admin reading a report (whatever the deck's state). */
export async function deckReportTitles(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.flashcardDeck.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((r) => [r.id, r.title]));
}
