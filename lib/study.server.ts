import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { documentTitles, hrefFor } from '@/lib/reading/highlights.server';
import type { ReadingDocKind } from '@/lib/reading/schema';
import { isCardKind, isReviewable, noteIdOf, type CardKind } from '@/lib/study/card-types';
import { ACTIVE_REVIEW_WHERE, AUTHORED_WHERE, CARD_ORDER, REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { dueByDeck, reviewAllCount } from '@/lib/study/queue.server';
import type { SuspendReason } from '@/lib/study/queue';
import { insertCards } from '@/lib/study/deck-editor.server';
import {
  CARD_IMAGE_SELECT,
  NO_PICTURES,
  fromColumns,
  picturesOfRow,
  pictureUrls,
  type CardImage,
} from '@/lib/study/card-images';
import { lockPictureUrls } from '@/lib/study/card-images.server';
import {
  CARD_SOUND_SELECT,
  fromSoundColumns,
  soundFields,
  soundsOfRow,
  type CardSound,
} from '@/lib/study/card-sound';
import { readOcclusion, reviewDataFor, type Occlusion, type OcclusionReviewData } from '@/lib/study/occlusion';
import { cardHash, type UpdatesSummary } from '@/lib/study/deck-sync';
import { deckUpdatesSummary } from '@/lib/study/deck-sync.server';
import type { TestCard } from '@/lib/study/practice-test';
import type { DeckFolderSummary } from '@/lib/study/folders';
import { listFolders } from '@/lib/study/folders.server';
import { isSuggestable } from '@/lib/study/suggestions';
import type { DeckRole } from '@/lib/study/deck-access';
import { readDeckLanguage } from '@/lib/study/listen';
import { canReadDeck, deckRole } from '@/lib/study/deck-access.server';
import type { DeckInvitation, SharedDeckSummary } from '@/lib/study/deck-editors';
import { MEMBER_NAME, editorCounts, invitationTo, listInvitations } from '@/lib/study/deck-editors.server';

export interface DeckSummary {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
  /** Cards due today in this deck for the viewer (suspended cards excluded). */
  dueCount: number;
  /** The owner's private folder for this deck; null when it has none. */
  folderId: string | null;
}

export interface PopularDeck {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  user: { name: string | null; handle: string | null };
  /** Accepted editors besides the owner: "By <owner> with N editors", no names (s11-10). */
  editorCount: number;
}

export interface DecksList {
  mine: DeckSummary[];
  /** Decks the viewer is an accepted editor of: "Shared with you" (s11-10). Never carries the owner's folder or pace. */
  shared: SharedDeckSummary[];
  /** Open invitations to edit a deck: the deck's title and the owner's name, nothing more. */
  invitations: DeckInvitation[];
  popular: PopularDeck[];
  /** The viewer's own deck folders, in order (private; empty when signed out). */
  folders: DeckFolderSummary[];
  signedIn: boolean;
  /** What "Review all" holds now across every readable deck; 0 when signed out. */
  reviewAllCount: number;
  /** True when one of the viewer's decks has a pace: its counts depend on the viewer's time zone (s10-03). */
  paced?: boolean;
}

/**
 * List a viewer's own decks plus popular public decks. Shared by the
 * `/api/study/decks` GET handler and the `/study` route loader so the page is
 * server-rendered / prefetched instead of fetched client-side on mount. Pass
 * `null` for signed-out visitors (they see only public decks).
 */
export async function listDecks(userId: string | null, tz?: string): Promise<DecksList> {
  const [mine, popular, folders, sharedRows, invitations] = await Promise.all([
    userId
      ? prisma.flashcardDeck.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, description: true, isPublic: true, cardCount: true, folderId: true, newPerDay: true },
        })
      : Promise.resolve([]),
    prisma.flashcardDeck.findMany({
      // A public deck the viewer edits is in "Shared with you", not here.
      where: {
        isPublic: true,
        ...(userId ? { userId: { not: userId }, editors: { none: { userId, status: 'accepted' } } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, title: true, description: true, cardCount: true, user: { select: { name: true, handle: true } } },
    }),
    userId ? listFolders(userId) : Promise.resolve([] as DeckFolderSummary[]),
    userId
      ? prisma.flashcardDeck.findMany({
          where: { userId: { not: userId }, editors: { some: { userId, status: 'accepted' } } },
          orderBy: { updatedAt: 'desc' },
          take: 200,
          // The owner's folder, pace and test date are not selected: an editor never receives them.
          select: {
            id: true,
            title: true,
            description: true,
            cardCount: true,
            user: { select: MEMBER_NAME },
          },
        })
      : Promise.resolve([]),
    userId ? listInvitations(userId) : Promise.resolve([] as DeckInvitation[]),
  ]);
  const popularCounts = await editorCounts(popular.map((d) => d.id));
  // Due counts skip suspended cards (lib/study/queue.server.ts applies ACTIVE_REVIEW_WHERE).
  const [dueMap, reviewAll] = userId
    ? await Promise.all([dueByDeck(userId, new Date(), tz), reviewAllCount(userId, new Date(), tz)])
    : [new Map<string, number>(), 0];
  return {
    mine: mine.map(({ newPerDay: _pace, ...d }) => ({ ...d, dueCount: dueMap.get(d.id) ?? 0 })),
    shared: (Array.isArray(sharedRows) ? sharedRows : []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      cardCount: d.cardCount,
      dueCount: dueMap.get(d.id) ?? 0,
      owner: { name: d.user.profile?.displayName ?? d.user.name ?? d.user.handle ?? '', handle: d.user.handle },
    })),
    invitations,
    popular: popular.map((d) => ({ ...d, editorCount: popularCounts.get(d.id) ?? 0 })),
    folders,
    signedIn: !!userId,
    reviewAllCount: reviewAll,
    ...(mine.some((d) => typeof d.newPerDay === 'number') ? { paced: true } : {}),
  };
}

export interface MarketplaceDeck {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  user: { name: string | null; handle: string | null; image: string | null };
  isOwn: boolean;
  alreadyCloned: boolean;
  /** Accepted editors besides the owner (s11-10); no names. */
  editorCount: number;
  /** The deck's first card with a picture, for the preview; absent when no card has one (s08-15). */
  preview?: { front: string; image: CardImage };
}

export interface MarketplaceList {
  decks: MarketplaceDeck[];
  signedIn: boolean;
}

const MARKETPLACE_LIMIT = 60;

/**
 * Browse public decks (the deck "marketplace"). Ranked by size then recency,
 * optionally filtered by a title/description query. Flags decks the viewer owns
 * or has already cloned so the UI can disable re-adding them.
 */
export async function listMarketplaceDecks(
  viewerId: string | null,
  query: string | null,
): Promise<MarketplaceList> {
  const q = query?.trim();
  const decks = await prisma.flashcardDeck.findMany({
    where: {
      isPublic: true,
      cardCount: { gt: 0 },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ cardCount: 'desc' }, { updatedAt: 'desc' }],
    take: MARKETPLACE_LIMIT,
    select: {
      id: true,
      title: true,
      description: true,
      cardCount: true,
      userId: true,
      user: { select: { name: true, handle: true, image: true } },
    },
  });

  // Which of these has the viewer already cloned?
  let clonedSet = new Set<string>();
  if (viewerId) {
    const cloned = await prisma.flashcardDeck.findMany({
      where: { userId: viewerId, clonedFromId: { in: decks.map((d) => d.id) } },
      select: { clonedFromId: true },
    });
    clonedSet = new Set(cloned.map((c) => c.clonedFromId).filter((v): v is string => !!v));
  }

  const counts = await editorCounts(decks.map((d) => d.id));

  // One preview per deck: its first card with a picture (the front's when both sides have one).
  const previews = new Map<string, { front: string; image: CardImage }>();
  if (decks.length > 0) {
    const pictured = await prisma.flashcard.findMany({
      where: {
        deckId: { in: decks.map((d) => d.id) },
        ...AUTHORED_WHERE,
        OR: [{ frontImageUrl: { not: null } }, { backImageUrl: { not: null } }],
      },
      distinct: ['deckId'],
      orderBy: [{ deckId: 'asc' }, { position: 'asc' }],
      select: { deckId: true, front: true, ...CARD_IMAGE_SELECT },
    });
    for (const row of pictured) {
      const { frontImage, backImage } = fromColumns(row);
      const image = frontImage ?? backImage;
      if (image) previews.set(row.deckId, { front: row.front, image });
    }
  }

  return {
    signedIn: !!viewerId,
    decks: decks.map((d) => {
      const preview = previews.get(d.id);
      return {
        id: d.id,
        title: d.title,
        description: d.description,
        cardCount: d.cardCount,
        user: d.user,
        isOwn: d.userId === viewerId,
        alreadyCloned: clonedSet.has(d.id),
        editorCount: counts.get(d.id) ?? 0,
        ...(preview ? { preview } : {}),
      };
    }),
  };
}

const MAX_DECKS = 200;

export type CloneResult =
  | { ok: true; id: string; alreadyOwned: boolean }
  | { ok: false; error: string; status: number };

/**
 * Clone a public deck (with its cards) into the viewer's own decks. Idempotent:
 * if the viewer already cloned this source deck, returns the existing copy.
 * Copies are private by default. Rejects private/own/oversized cases.
 */
export async function cloneDeck(userId: string, sourceId: string): Promise<CloneResult> {
  const source = await prisma.flashcardDeck.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      title: true,
      description: true,
      // The languages describe the cards, so a copy keeps them (s11-17); sync never touches them afterwards.
      frontLang: true,
      backLang: true,
      // Authored cards only: the clone's siblings are generated again, so they get their own ids.
      cards: {
        where: AUTHORED_WHERE,
        orderBy: CARD_ORDER,
        select: { id: true, kind: true, front: true, back: true, occlusion: true, ...CARD_IMAGE_SELECT },
      },
    },
  });
  if (!source || !source.isPublic) return { ok: false, ...refusalBody('STUDY_DECK_NOT_FOUND'), status: 404 };
  if (source.userId === userId) return { ok: false, ...refusalBody('STUDY_DECK_OWN'), status: 400 };

  // Idempotent: don't create duplicate clones of the same source.
  const existing = await prisma.flashcardDeck.findFirst({
    where: { userId, clonedFromId: sourceId },
    select: { id: true },
  });
  if (existing) return { ok: true, id: existing.id, alreadyOwned: true };

  const count = await prisma.flashcardDeck.count({ where: { userId } });
  if (count >= MAX_DECKS) return { ok: false, ...refusalBody('STUDY_DECK_LIMIT'), status: 400 };

  const deck = await prisma.$transaction(async (tx) => {
    const created = await tx.flashcardDeck.create({
      data: {
        userId,
        title: source.title.slice(0, 100),
        description: source.description?.slice(0, 500) ?? null,
        frontLang: source.frontLang,
        backLang: source.backLang,
        isPublic: false,
        clonedFromId: sourceId,
        sourceSyncedAt: new Date(),
        cardCount: source.cards.length,
      },
      select: { id: true },
    });
    if (source.cards.length > 0) {
      // The copy SHARES the author's picture objects (same URL, never a second object). The URLs are locked first,
      // the cards' pictures read again under the lock, so an author removing a picture right now either finishes
      // first (the copy gets none) or waits for this copy to commit (the object stays).
      await lockPictureUrls(
        tx,
        source.cards.flatMap((c) => pictureUrls(c)),
      );
      const current = new Map(
        (
          await tx.flashcard.findMany({
            where: { id: { in: source.cards.map((c) => c.id) } },
            select: { id: true, occlusion: true, ...CARD_IMAGE_SELECT },
          })
        ).map((row) => [row.id, row]),
      );
      await insertCards(
        tx,
        created.id,
        source.cards.map((c) => {
          const live = { ...c, ...(current.get(c.id) ?? NO_PICTURES) };
          return {
            kind: cardKind(c.kind),
            front: c.front,
            back: c.back,
            ...(live.kind === 'occlusion' ? { occlusion: readOcclusion(live.occlusion) } : {}),
            ...fromColumns(live),
            originCardId: c.id,
            originHash: cardHash(live),
          };
        }),
      );
    }
    return created;
  });
  return { ok: true, id: deck.id, alreadyOwned: false };
}

const cardKind = (kind: string): CardKind => (isCardKind(kind) ? kind : 'basic');

/** The picture fields of a card payload: present only for a side that has a picture, so a text card is unchanged. */
export function pictureFields(pictures: { frontImage: CardImage | null; backImage: CardImage | null }) {
  return {
    ...(pictures.frontImage ? { frontImage: pictures.frontImage } : {}),
    ...(pictures.backImage ? { backImage: pictures.backImage } : {}),
  };
}

/** An authored card as the deck page, the editor and export read it. */
export interface DeckCard {
  id: string;
  front: string;
  back: string;
  kind: CardKind;
  /** Always null for an authored card; set on the generated cards review returns. */
  clozeIndex: number | null;
  sourceId: string | null;
  /** The viewer's suspension of this card (or of a card generated from it); absent for a signed-out viewer. */
  suspended?: SuspendReason | null;
  /** The pictures this card shows (a generated card reads its source's); absent when it has none (s08-15). */
  frontImage?: CardImage | null;
  backImage?: CardImage | null;
  /** The sounds the OWNER recorded (s10-02); every other viewer's payload carries neither field. */
  frontSound?: CardSound;
  backSound?: CardSound;
  /** The masks of an authored occlusion card (the editor draws them over the front picture; s09-03). */
  occlusion?: Occlusion | null;
  /** On a generated occlusion card in review: the masks and the one this card asks. */
  occlusionReview?: OcclusionReviewData | null;
  /**
   * The document whose highlight this card was made from (s10-01). The owner's payload only: the link names a private
   * highlight, so every other viewer's card carries no such field.
   */
  highlightSource?: { title: string; href: string };
  /**
   * Where "Suggest a fix" on this card goes (s10-04): this deck's card on a public deck that takes suggestions, or the
   * source deck's card on a copy of one that does. Absent for the author, a signed-out viewer, an occlusion card and
   * any deck that has not turned suggestions on.
   */
  suggestTarget?: { deckId: string; cardId: string };
}

export interface DeckDetail {
  deck: {
    id: string;
    title: string;
    description: string | null;
    isPublic: boolean;
    /** The deck's owner. Everything owner-only (settings, folder, pace, sounds, suggestions) keys off this. */
    isOwner: boolean;
    /** The viewer's role: `owner`, `editor` (an accepted editor) or null. An editor adds and edits cards and studies. */
    role: DeckRole | null;
    /** Authored cards: what the owner wrote. */
    cardCount: number;
    /** Added from another deck (the marketplace). */
    isCopy: boolean;
    /** "Tell me about updates" (copies only). */
    notifyUpdates: boolean;
    /** The author lets people who study the deck suggest fixes (s10-04); off until they turn it on. */
    acceptsSuggestions: boolean;
    /** The languages the fronts and backs are written in (a tag from `DECK_LANGUAGE_TAGS`), null: the site's. */
    frontLang?: string | null;
    backLang?: string | null;
    /** The owner's folder for this deck (owner only; absent for every other viewer). */
    folderId?: string | null;
    /**
     * A public deck's byline: its owner's name and how many accepted editors it has, never their names (s11-10).
     * Absent on a private deck and for the owner.
     */
    byline?: { owner: { name: string; handle: string | null }; editors: number };
  };
  /**
   * The viewer's open invitation to edit this deck (s11-10). On a private deck it is all they receive: no cards, no
   * counts, the title and the owner's name.
   */
  invitation?: DeckInvitation;
  /** What the author of the original changed; owner of a copy only, null when there is nothing to say. */
  updates: UpdatesSummary | null;
  /** The authored cards, in deck order. */
  cards: DeckCard[];
  /** Cards a member studies: authored plus generated, minus authored cloze text. */
  reviewCount: number;
  /** Every row in the deck, generated cards included: what the 2,000-card cap counts. */
  rowCount: number;
  dueCount: number;
  /** Cards the viewer has suspended in this deck (generated cards included). */
  suspendedCount: number;
  signedIn: boolean;
}

/** Titles and links of the documents the owner's cards were made from (s10-01); a link to someone else's highlight is ignored. */
async function highlightSources(
  cards: readonly {
    id: string;
    highlightLink?: { highlight: { docKind: ReadingDocKind; docKey: string; userId: string } } | null;
  }[],
  ownerId: string,
): Promise<Map<string, { title: string; href: string }>> {
  const linked = cards.flatMap((c) =>
    c.highlightLink && c.highlightLink.highlight.userId === ownerId
      ? [{ id: c.id, docKind: c.highlightLink.highlight.docKind, docKey: c.highlightLink.highlight.docKey }]
      : [],
  );
  const out = new Map<string, { title: string; href: string }>();
  if (linked.length === 0) return out;
  const titles = await documentTitles(linked);
  for (const l of linked) {
    out.set(l.id, { title: titles.get(`${l.docKind}:${l.docKey}`) ?? l.docKey, href: hrefFor(l.docKind, l.docKey) });
  }
  return out;
}

/** What a pending invitee receives of a private deck: the invitation line, no cards and no counts (s11-10). */
function invitationOnly(invitation: DeckInvitation): DeckDetail {
  return {
    deck: {
      id: invitation.deckId,
      title: invitation.title,
      description: null,
      isPublic: false,
      isOwner: false,
      role: null,
      cardCount: 0,
      isCopy: false,
      notifyUpdates: true,
      acceptsSuggestions: false,
    },
    invitation,
    updates: null,
    cards: [],
    reviewCount: 0,
    rowCount: 0,
    dueCount: 0,
    suspendedCount: 0,
    signedIn: true,
  };
}

/** True for the deck a pending invitee receives: nothing of it is readable yet (the pages that show cards refuse it). */
export const isInvitationOnly = (detail: DeckDetail): boolean => detail.deck.role === null && !detail.deck.isPublic;

/** The "Suggest a fix" target of one card row, when the deck page offers it (text cards only). */
function suggestTargetFor(
  suggestDeckId: string | null,
  thisDeckId: string,
  card: { id: string; kind: string; originCardId: string | null },
): { suggestTarget?: { deckId: string; cardId: string } } {
  if (!suggestDeckId || !isSuggestable(card.kind)) return {};
  const cardId = suggestDeckId === thisDeckId ? card.id : card.originCardId;
  return cardId ? { suggestTarget: { deckId: suggestDeckId, cardId } } : {};
}

/**
 * Resolve a single deck (with its authored cards + this viewer's due count) for the given
 * viewer. Shared by the `/api/study/decks/$id` GET handler and the
 * `/study/$deckId` route loader. Returns `null` when the deck does not exist or
 * is private and the viewer is not its owner (the caller maps that to a 404 /
 * not-found state).
 */
export async function getDeck(deckId: string, viewer: { id: string | null }): Promise<DeckDetail | null> {
  // One role decides everything below; a pending invitee has none and reads only the invitation.
  const role = viewer.id ? await deckRole(viewer.id, deckId) : null;
  const invitation = viewer.id && role === null ? await invitationTo(viewer.id, deckId) : null;
  const preview = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { isPublic: true },
  });
  if (!preview) return null;
  if (!preview.isPublic && role === null) return invitation ? invitationOnly(invitation) : null;
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: {
      id: true, title: true, description: true, isPublic: true, userId: true, cardCount: true,
      clonedFromId: true, notifyUpdates: true, folderId: true, acceptsSuggestions: true, frontLang: true, backLang: true,
      user: { select: MEMBER_NAME },
      cards: {
        orderBy: CARD_ORDER,
        select: {
          id: true,
          front: true,
          back: true,
          kind: true,
          sourceId: true,
          clozeIndex: true,
          occlusion: true,
          originCardId: true,
          ...CARD_IMAGE_SELECT,
          // Sounds are the recorder's alone: `soundFields(…, isOwner)` below drops them for any other viewer.
          ...CARD_SOUND_SELECT,
          highlightLink: { select: { highlight: { select: { docKind: true, docKey: true, userId: true } } } },
        },
      },
    },
  });
  if (!deck) return null;
  const isOwner = role === 'owner';
  if (!deck.isPublic && role === null) return null;
  const sources = isOwner ? await highlightSources(deck.cards, deck.userId) : new Map<string, { title: string; href: string }>();

  // Due cards are counted over what is reviewed (generated cards included), not what is listed.
  const reviewable = deck.cards.filter(isReviewable);
  let dueCount = 0;
  const suspendedBy = new Map<string, SuspendReason>();
  if (viewer.id) {
    const ids = reviewable.map((c) => c.id);
    // A suspended card has a review row but is not due: only active rows schedule, suspended ones are read apart.
    const [active, suspended] = await Promise.all([
      prisma.flashcardReview.findMany({
        where: { userId: viewer.id, cardId: { in: ids }, ...ACTIVE_REVIEW_WHERE },
        select: { cardId: true, dueAt: true },
      }),
      prisma.flashcardReview.findMany({
        where: { userId: viewer.id, cardId: { in: ids }, suspendedAt: { not: null } },
        select: { cardId: true, suspendReason: true },
      }),
    ]);
    for (const s of suspended) {
      suspendedBy.set(s.cardId, s.suspendReason === 'leech' ? 'leech' : 'manual');
    }
    const reviewedMap = new Map(active.map((r) => [r.cardId, r.dueAt]));
    const now = Date.now();
    for (const c of reviewable) {
      if (suspendedBy.has(c.id)) continue;
      const due = reviewedMap.get(c.id);
      if (!due || due.getTime() <= now) dueCount++;
    }
  }
  // An authored note shows as suspended when it, or a card generated from it, is.
  const suspendedOf = (cardId: string): SuspendReason | null => {
    const own = suspendedBy.get(cardId);
    if (own) return own;
    for (const c of deck.cards) {
      if (c.sourceId === cardId && suspendedBy.has(c.id)) return suspendedBy.get(c.id) ?? null;
    }
    return null;
  };

  // "Suggest a fix" (s10-04): a signed-in reader of a public deck that takes suggestions, or the holder of a copy of
  // one that does. The server refuses everything the page cannot see (blocks, bans, new accounts) when they send it.
  let suggestDeckId: string | null = null;
  // An editor edits the deck directly, so it offers them no suggestion either.
  if (viewer.id && role === null && deck.isPublic && deck.acceptsSuggestions) suggestDeckId = deck.id;
  if (viewer.id && isOwner && deck.clonedFromId) {
    const origin = await prisma.flashcardDeck.findUnique({
      where: { id: deck.clonedFromId },
      select: { userId: true, acceptsSuggestions: true },
    });
    if (origin && origin.userId !== viewer.id && origin.acceptsSuggestions) suggestDeckId = deck.clonedFromId;
  }

  return {
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      isPublic: deck.isPublic,
      isOwner,
      role,
      cardCount: deck.cardCount,
      isCopy: !!deck.clonedFromId,
      // "Tell me about updates" is the owner's setting: no other viewer's payload carries it (a neutral default stands in).
      notifyUpdates: isOwner ? (deck.notifyUpdates ?? true) : true,
      acceptsSuggestions: deck.acceptsSuggestions,
      // What the cards are written in, for Listen (s11-17): the same for every reader, it describes the cards.
      frontLang: readDeckLanguage(deck.frontLang),
      backLang: readDeckLanguage(deck.backLang),
      // A folder is the owner's private organisation: no other viewer's payload carries it.
      ...(isOwner ? { folderId: deck.folderId ?? null } : {}),
      ...(deck.isPublic && !isOwner
        ? {
            byline: {
              owner: {
                name: deck.user.profile?.displayName ?? deck.user.name ?? deck.user.handle ?? '',
                handle: deck.user.handle,
              },
              editors: (await editorCounts([deck.id])).get(deck.id) ?? 0,
            },
          }
        : {}),
    },
    ...(invitation ? { invitation } : {}),
    updates:
      isOwner && deck.clonedFromId && (deck.notifyUpdates ?? true)
        ? await deckUpdatesSummary(viewer.id as string, deck.id).catch(() => null)
        : null,
    cards: deck.cards
      .filter((c) => c.sourceId === null)
      .map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        kind: cardKind(c.kind),
        clozeIndex: null,
        sourceId: null,
        ...(viewer.id ? { suspended: suspendedOf(c.id) } : {}),
        ...pictureFields(fromColumns(c)),
        ...soundFields(fromSoundColumns(c), isOwner),
        ...(c.kind === 'occlusion' ? { occlusion: readOcclusion(c.occlusion) } : {}),
        ...suggestTargetFor(suggestDeckId, deck.id, c),
        ...(sources.get(c.id) ? { highlightSource: sources.get(c.id) as { title: string; href: string } } : {}),
      })),
    reviewCount: reviewable.length,
    rowCount: deck.cards.length,
    dueCount,
    suspendedCount: suspendedBy.size,
    signedIn: !!viewer.id,
  };
}

/**
 * The cards a practice test draws from: reviewable cards only, each with the note it belongs to
 * so a test never asks about the same fact twice. The caller has already checked the viewer may
 * read the deck.
 */
export async function getTestCards(deckId: string, viewerId: string | null = null): Promise<TestCard[]> {
  // The caller has checked the viewer may read the deck; this checks again, so no route can hand a pending invitee
  // (or a removed editor) the cards of a private deck.
  const gate = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { id: true, isPublic: true, userId: true },
  });
  if (!gate || !(viewerId ? await canReadDeck(viewerId, gate) : gate.isPublic)) return [];
  const rows = await prisma.flashcard.findMany({
    where: { deckId, ...REVIEWABLE_WHERE },
    orderBy: CARD_ORDER,
    select: {
      id: true,
      front: true,
      back: true,
      kind: true,
      sourceId: true,
      clozeIndex: true,
      ...CARD_IMAGE_SELECT,
      ...CARD_SOUND_SELECT,
      // A generated card shows its source's pictures (the siblings hold none of their own); an occlusion card
      // also reads its masks and note from the source. Sounds follow the same rule, and are sent to the deck's
      // owner only (s10-02).
      source: { select: { ...CARD_IMAGE_SELECT, ...CARD_SOUND_SELECT, occlusion: true, back: true } },
      deck: { select: { userId: true } },
    },
  });
  return rows.map((r) => {
    const review = r.kind === 'occlusion' ? reviewDataFor(r.source, r.clozeIndex) : null;
    const owner = viewerId !== null && r.deck.userId === viewerId;
    return {
      id: r.id,
      front: r.front,
      back: r.back,
      clozeIndex: r.clozeIndex,
      noteId: noteIdOf(r),
      ...pictureFields(picturesOfRow(r, r.source)),
      ...soundFields(soundsOfRow(r, r.source), owner),
      ...(review ? { occlusion: review } : {}),
    };
  });
}
