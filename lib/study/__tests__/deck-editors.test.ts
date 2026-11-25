/**
 * Editing a flashcard deck together (s11-10), against the in-memory study database: the owner invites up to ten
 * editors (fifty open invitations an owner), the invitee accepts or declines, an editor adds, edits, deletes, reorders
 * and imports cards but is refused every owner-only change and never touches a sound, removing an editor stops every
 * read at once, and a pending invitee reads only the invitation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  media: [] as unknown[],
  editors: [] as unknown[],
  users: [] as unknown[],
  blocks: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
const notices = vi.hoisted(() => [] as Record<string, unknown>[]);
const raw = vi.hoisted(() => [] as { sql: string; values: unknown[] }[]);
const reviewFindMany = vi.hoisted(() => vi.fn(async (_args: unknown) => [] as unknown[]));
const cardFindMany = vi.hoisted(() => vi.fn(async (_args: unknown) => [] as unknown[]));
/** The fake database's own `flashcard.findMany`, which the card readers use unless a test hands the queue its rows. */
const realCardFindMany = vi.hoisted(() => ({ run: async (_args: unknown) => [] as unknown[] }));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: Record<string, unknown>) => {
    notices.push(n);
  },
}));
vi.mock('@/lib/handles/lookup.server', () => ({
  findUsersByHandles: async (handles: string[]) =>
    (db.users as { id: string; handle?: string | null }[])
      .filter((u) => handles.map((h) => h.toLowerCase()).includes((u.handle ?? '').toLowerCase()))
      .map((u) => ({ id: u.id, handle: u.handle ?? null })),
}));
vi.mock('@/lib/storage/s3.server', () => ({
  putObject: async () => {},
  deleteObject: async () => {},
  getObject: async () => null,
  getObjectRange: async () => null,
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  realCardFindMany.run = prisma.flashcard.findMany as unknown as (args: unknown) => Promise<unknown[]>;
  return {
    prisma: {
      ...prisma,
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        raw.push({ sql: strings.join('?'), values });
        return [] as unknown[];
      }),
      flashcardReviewLog: { findFirst: vi.fn(async () => null) },
      flashcardReview: { ...prisma.flashcardReview, findMany: reviewFindMany, count: vi.fn(async () => 0) },
      flashcard: { ...prisma.flashcard, findMany: cardFindMany, groupBy: vi.fn(async () => []) },
    },
  };
});

const { addCard, updateCard, deleteCard, importCards, reorderCards, updateDeck, deleteDeck, upsertCardByExternalId } =
  await import('@/lib/study/deck-editor.server');
const editors = await import('@/lib/study/deck-editors.server');
const { deckRole, studiedDeckWhere, readableDeckWhere, canReadDeck } = await import('@/lib/study/deck-access.server');
const { getDeck, getTestCards, listDecks, isInvitationOnly } = await import('@/lib/study.server');
const { setDeckPace } = await import('@/lib/study/pace.server');
const { createCardsFromHighlights } = await import('@/lib/study/highlight-cards.server');
const { reviewQueue, dueByDeck, setSuspended } = await import('@/lib/study/queue.server');
const { getStudyStats } = await import('@/lib/study/stats.server');
const { createSuggestion } = await import('@/lib/study/suggestions.server');
const { recordTestResult } = await import('@/lib/study/tests.server');
const { MAX_DECK_EDITORS, MAX_PENDING_DECK_INVITES, DECK_INVITE_MS, inviteOpen } =
  await import('@/lib/study/deck-access');
const { prisma } = await import('@/lib/prisma.server');

const NOW = new Date('2026-12-01T12:00:00Z');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const user = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  handle: id,
  ...extra,
});
const sound = (id: string) => ({ url: `/api/study/card-sound/owner-${id}.webm`, transcript: 'hola', durationMs: 1500 });
const cardsOf = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const editorRows = () => db.editors ?? [];

/** A coded refusal: the status and the taxonomy code, never prose a test would have to keep in step. */
const refused = (result: { ok: boolean }) => result as { ok: false; status: number; code: string };

beforeEach(() => {
  Object.assign(db, newFakeDb());
  notices.length = 0;
  raw.length = 0;
  reviewFindMany.mockReset();
  reviewFindMany.mockResolvedValue([]);
  cardFindMany.mockReset();
  cardFindMany.mockImplementation((args) => realCardFindMany.run(args));
  db.users = [user('owner'), user('ed'), user('other'), user('third'), user('pending')];
  db.blocks = [];
  db.editors = [];
  db.media = [
    {
      id: 'm1',
      userId: 'owner',
      key: 'k1',
      url: sound('a').url,
      status: 'PENDING',
      contentType: 'audio/webm',
      bytes: 100,
    },
  ];
  db.decks = [
    { id: 'd1', userId: 'owner', title: 'Spanish', description: null, isPublic: false, cardCount: 0 },
    { id: 'pub', userId: 'owner', title: 'Public', description: null, isPublic: true, cardCount: 0 },
    {
      id: 'copy',
      userId: 'owner',
      title: 'A copy',
      description: null,
      isPublic: false,
      cardCount: 0,
      clonedFromId: 'someone-elses',
    },
  ];
});

/** An accepted editor row, as if the invitation had been taken up. */
const accept = (deckId: string, userId: string) =>
  editorRows().push({
    deckId,
    userId,
    invitedById: 'owner',
    status: 'accepted',
    createdAt: ago(DAY),
    acceptedAt: ago(DAY),
  });

describe('inviting', () => {
  it('invites a member by handle, tells them, and lists them as pending', async () => {
    const res = await editors.inviteEditor('owner', 'd1', 'ed', NOW);
    expect(res).toMatchObject({ ok: true, editor: { userId: 'ed', handle: 'ed', status: 'pending' } });
    expect(editorRows()).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      userId: 'ed',
      type: 'SYSTEM',
      entityType: 'deck-editor',
      entityId: 'd1',
      link: '/study/d1',
      preview: { key: 'deck-editor-invited', params: { name: 'OWNER', deck: 'Spanish' } },
    });
  });

  it('takes the deck lock and then the owner lock before it counts, so two invitations cannot both pass a cap', async () => {
    await editors.inviteEditor('owner', 'd1', 'ed', NOW);
    expect(db.locks).toEqual(['deck-editors:d1', 'deck-invites:owner']);
  });

  it('is the owner’s alone: an editor, a stranger and a missing deck find nothing', async () => {
    accept('d1', 'ed');
    expect(refused(await editors.inviteEditor('ed', 'd1', 'other', NOW))).toMatchObject({ status: 404 });
    expect(refused(await editors.inviteEditor('other', 'd1', 'third', NOW))).toMatchObject({ status: 404 });
    expect(refused(await editors.inviteEditor('owner', 'nope', 'ed', NOW))).toMatchObject({ status: 404 });
    expect(editorRows()).toHaveLength(1);
  });

  it('refuses a copy of another member’s deck, the owner themselves and an unknown handle', async () => {
    expect(refused(await editors.inviteEditor('owner', 'copy', 'ed', NOW))).toMatchObject({
      status: 400,
      code: 'DECK_EDITOR_COPY',
    });
    expect(refused(await editors.inviteEditor('owner', 'd1', 'owner', NOW))).toMatchObject({ status: 400 });
    expect(refused(await editors.inviteEditor('owner', 'd1', 'nobody', NOW))).toMatchObject({ status: 404 });
    expect(editorRows()).toHaveLength(0);
  });

  it('refuses a member blocked either way, banned or with a deletion pending, all with the same answer', async () => {
    db.blocks = [{ id: 'b1', blockerId: 'ed', blockedId: 'owner' }];
    const blockedByThem = refused(await editors.inviteEditor('owner', 'd1', 'ed', NOW));
    db.blocks = [{ id: 'b2', blockerId: 'owner', blockedId: 'other' }];
    const blockedByMe = refused(await editors.inviteEditor('owner', 'd1', 'other', NOW));
    (db.users as { id: string; bannedUntil?: Date }[]).find((u) => u.id === 'third')!.bannedUntil = new Date(
      NOW.getTime() + DAY,
    );
    const banned = refused(await editors.inviteEditor('owner', 'd1', 'third', NOW));
    (db.users as { id: string; deletionScheduledAt?: Date }[]).find((u) => u.id === 'pending')!.deletionScheduledAt =
      NOW;
    const deleting = refused(await editors.inviteEditor('owner', 'd1', 'pending', NOW));
    for (const r of [blockedByThem, blockedByMe, banned, deleting]) {
      expect(r).toMatchObject({ status: 403, code: 'DECK_EDITOR_UNAVAILABLE' });
    }
    // The answer is the same sentence whichever reason it was: no one learns who blocked whom.
    expect(new Set([blockedByThem, blockedByMe, banned, deleting].map((r) => JSON.stringify(r))).size).toBe(1);
    expect(editorRows()).toHaveLength(0);
    expect(notices).toHaveLength(0);
  });

  it('refuses a member already invited or already an editor', async () => {
    await editors.inviteEditor('owner', 'd1', 'ed', NOW);
    expect(refused(await editors.inviteEditor('owner', 'd1', 'ed', NOW))).toMatchObject({
      status: 409,
      code: 'DECK_EDITOR_ALREADY',
    });
    accept('d1', 'other');
    expect(refused(await editors.inviteEditor('owner', 'd1', 'other', NOW))).toMatchObject({
      code: 'DECK_EDITOR_ALREADY',
    });
  });

  it(`holds a deck to ${MAX_DECK_EDITORS} editors (open invitations count), and a lapsed one does not`, async () => {
    for (let i = 0; i < MAX_DECK_EDITORS - 1; i++) accept('d1', `e${i}`);
    editorRows().push({
      deckId: 'd1',
      userId: 'lapsed',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DECK_INVITE_MS + 1000),
    });
    // Nine accepted and one lapsed invitation: there is room for one more.
    expect(await editors.inviteEditor('owner', 'd1', 'ed', NOW)).toMatchObject({ ok: true });
    const full = refused(await editors.inviteEditor('owner', 'd1', 'other', NOW));
    expect(full).toMatchObject({ status: 409, code: 'DECK_EDITOR_FULL', max: MAX_DECK_EDITORS });
  });

  it(`holds an owner to ${MAX_PENDING_DECK_INVITES} open invitations across their decks`, async () => {
    for (let i = 0; i < MAX_PENDING_DECK_INVITES; i++) {
      editorRows().push({
        deckId: `elsewhere-${i}`,
        userId: `p${i}`,
        invitedById: 'owner',
        status: 'pending',
        createdAt: ago(DAY),
      });
    }
    const res = refused(await editors.inviteEditor('owner', 'd1', 'ed', NOW));
    expect(res).toMatchObject({ status: 409, code: 'DECK_EDITOR_INVITES_FULL', max: MAX_PENDING_DECK_INVITES });
  });

  it('replaces a lapsed invitation with a fresh one', async () => {
    editorRows().push({
      deckId: 'd1',
      userId: 'ed',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DECK_INVITE_MS + DAY),
    });
    expect(await editors.inviteEditor('owner', 'd1', 'ed', NOW)).toMatchObject({ ok: true });
    expect(editorRows()).toHaveLength(1);
    expect(inviteOpen((editorRows()[0] as { createdAt: Date }).createdAt, new Date())).toBe(true);
  });
});

describe('answering an invitation', () => {
  beforeEach(async () => {
    await editors.inviteEditor('owner', 'd1', 'ed', NOW);
    notices.length = 0;
  });

  it('accepting gives access and tells the owner', async () => {
    expect(await deckRole('ed', 'd1')).toBeNull();
    expect(await editors.acceptInvitation('ed', 'd1', NOW)).toEqual({ ok: true, accepted: true });
    expect(await deckRole('ed', 'd1')).toBe('editor');
    expect(notices[0]).toMatchObject({
      userId: 'owner',
      entityType: 'deck-editor',
      preview: { key: 'deck-editor-accepted', params: { name: 'ED', deck: 'Spanish' } },
    });
  });

  it('a second accept changes nothing and tells no one again', async () => {
    await editors.acceptInvitation('ed', 'd1', NOW);
    notices.length = 0;
    expect(await editors.acceptInvitation('ed', 'd1', NOW)).toEqual({ ok: true, accepted: true });
    expect(notices).toHaveLength(0);
  });

  it('declining removes the invitation and tells no one', async () => {
    expect(await editors.declineInvitation('ed', 'd1')).toEqual({ ok: true });
    expect(editorRows()).toHaveLength(0);
    expect(notices).toHaveLength(0);
    expect(refused(await editors.declineInvitation('ed', 'd1'))).toMatchObject({ status: 404 });
  });

  it('an invitation lapses after 14 days: it cannot be accepted, and no longer shows', async () => {
    const later = new Date(NOW.getTime() + DECK_INVITE_MS + 1000);
    expect(refused(await editors.acceptInvitation('ed', 'd1', later))).toMatchObject({ status: 410, code: 'GONE' });
    expect(await editors.listInvitations('ed', later)).toEqual([]);
    expect(await editors.invitationTo('ed', 'd1', later)).toBeNull();
    expect(await deckRole('ed', 'd1')).toBeNull();
    expect(await editors.listInvitations('ed', NOW)).toHaveLength(1);
  });

  it('is the invitee’s own row: someone else cannot accept it', async () => {
    expect(refused(await editors.acceptInvitation('other', 'd1', NOW))).toMatchObject({ status: 404 });
    expect(await deckRole('other', 'd1')).toBeNull();
  });

  it('cannot be taken up once the owner blocked the invitee', async () => {
    db.blocks = [{ id: 'b', blockerId: 'owner', blockedId: 'ed' }];
    expect(refused(await editors.acceptInvitation('ed', 'd1', NOW))).toMatchObject({ status: 403 });
    expect(await deckRole('ed', 'd1')).toBeNull();
  });
});

describe('what an editor may do', () => {
  beforeEach(() => accept('d1', 'ed'));

  it('adds, edits, deletes and imports cards in the owner’s deck', async () => {
    const added = await addCard('ed', 'd1', { front: 'hola', back: 'hello' });
    expect(added).toMatchObject({ ok: true });
    const id = (added as { card: { id: string } }).card.id;
    expect(await updateCard('ed', id, { back: 'hi' })).toEqual({ ok: true });
    expect(cardsOf('d1')[0]).toMatchObject({ back: 'hi' });
    expect(
      await importCards('ed', 'd1', [
        { front: 'a', back: 'b' },
        { front: 'c', back: 'd' },
      ]),
    ).toMatchObject({
      ok: true,
      created: 2,
      cardCount: 3,
    });
    expect(await deleteCard('ed', id)).toEqual({ ok: true });
    expect(cardsOf('d1')).toHaveLength(2);
    expect((db.decks as { id: string; cardCount: number }[]).find((d) => d.id === 'd1')!.cardCount).toBe(2);
  });

  it('adds ten cards and the owner sees all ten', async () => {
    const batch = Array.from({ length: 10 }, (_, i) => ({ front: `q${i}`, back: `a${i}` }));
    expect(await importCards('ed', 'd1', batch)).toMatchObject({ ok: true, created: 10 });
    const seen = await getDeck('d1', { id: 'owner' });
    expect(seen?.cards).toHaveLength(10);
    expect(seen?.deck).toMatchObject({ isOwner: true, role: 'owner', cardCount: 10 });
  });

  it('reorders the deck’s cards', async () => {
    await importCards('ed', 'd1', [
      { front: 'a', back: '1' },
      { front: 'b', back: '2' },
    ]);
    const [first, second] = cardsOf('d1').map((c) => c.id);
    expect(await reorderCards('ed', 'd1', [second!, first!])).toEqual({ ok: true });
    expect(cardsOf('d1').find((c) => c.id === second)).toMatchObject({ position: 0 });
  });

  it('is refused the title, visibility, suggestions, deleting the deck and the pace', async () => {
    const before = JSON.stringify(db.decks);
    expect(await updateDeck('ed', 'd1', { title: 'Mine now' })).toMatchObject({ ok: false, status: 404 });
    expect(await updateDeck('ed', 'd1', { isPublic: true })).toMatchObject({ ok: false, status: 404 });
    expect(await updateDeck('ed', 'd1', { acceptsSuggestions: true })).toMatchObject({ ok: false, status: 404 });
    expect(await deleteDeck('ed', 'd1')).toMatchObject({ ok: false, status: 404 });
    expect(await setDeckPace('ed', 'd1', { newPerDay: 50 })).toMatchObject({ ok: false, status: 404 });
    expect(JSON.stringify(db.decks)).toBe(before);
    expect(db.decks).toHaveLength(3);
    // The owner still can.
    expect(await updateDeck('owner', 'd1', { title: 'Renamed' })).toEqual({ ok: true });
  });

  it('cannot make cards from highlights, key cards by an external id, or suggest a fix to a deck it edits', async () => {
    expect(await createCardsFromHighlights('ed', 'd1', [{ highlightId: 'h1', kind: 'basic' } as never])).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await upsertCardByExternalId('ed', 'd1', 'k1', { front: 'a', back: 'b' })).toMatchObject({
      ok: false,
      status: 404,
    });
    (db.decks as { id: string; acceptsSuggestions?: boolean }[]).find((d) => d.id === 'pub')!.acceptsSuggestions = true;
    accept('pub', 'ed');
    expect(await createSuggestion('ed', 'pub', { cardId: 'c', front: 'a' })).toMatchObject({
      ok: false,
      reason: 'own-deck',
    });
  });

  it('an import from an editor carries no external key', async () => {
    await importCards('ed', 'd1', [{ front: 'a', back: 'b', externalId: 'script-1' }]);
    expect(cardsOf('d1')[0]!.externalId ?? null).toBeNull();
    await importCards('owner', 'd1', [{ front: 'c', back: 'd', externalId: 'script-2' }]);
    expect(cardsOf('d1').find((c) => c.front === 'c')).toMatchObject({ externalId: 'script-2' });
  });
});

describe('sounds stay with their recorder', () => {
  beforeEach(() => accept('d1', 'ed'));

  it('a card an editor adds carries no sound, and no recording is claimed', async () => {
    const res = await addCard('ed', 'd1', { front: 'hola', back: 'hello', backSound: sound('a') });
    expect(res).toMatchObject({ ok: true });
    expect(res).not.toHaveProperty('card.backSound');
    expect(cardsOf('d1')[0]).toMatchObject({ backSoundUrl: null });
    expect(db.media!.find((m) => m.id === 'm1')!.status).toBe('PENDING');
  });

  it('a card an editor saves keeps the sounds the owner recorded, and an editor cannot replace or remove them', async () => {
    const made = await addCard('owner', 'd1', { front: 'hola', back: 'hello', backSound: sound('a') });
    const id = (made as { card: { id: string } }).card.id;
    expect(cardsOf('d1')[0]).toMatchObject({ backSoundUrl: sound('a').url, backSoundText: 'hola' });
    expect(await updateCard('ed', id, { back: 'hi', backSound: null })).toEqual({ ok: true });
    expect(cardsOf('d1')[0]).toMatchObject({ back: 'hi', backSoundUrl: sound('a').url, backSoundText: 'hola' });
    // The owner's recording is not released by an editor's attempt to remove it.
    expect(db.media!.find((m) => m.url === sound('a').url)?.status).toBe('ATTACHED');
    expect(await updateCard('ed', id, { frontSound: sound('b') })).toEqual({ ok: true });
    expect(cardsOf('d1')[0]!.frontSoundUrl ?? null).toBeNull();
  });

  it('the deck page and a practice test send an editor no sound field at all', async () => {
    await addCard('owner', 'd1', { front: 'hola', back: 'hello', backSound: sound('a') });
    const forEditor = await getDeck('d1', { id: 'ed' });
    expect(forEditor?.cards).toHaveLength(1);
    expect(JSON.stringify(forEditor)).not.toContain('card-sound');
    expect(forEditor!.cards[0]).not.toHaveProperty('backSound');
    const owner = await getDeck('d1', { id: 'owner' });
    expect(owner!.cards[0]).toMatchObject({ backSound: { url: sound('a').url } });
    const test = await getTestCards('d1', 'ed');
    expect(test).toHaveLength(1);
    expect(JSON.stringify(test)).not.toContain('card-sound');
  });

  it('an editor’s delete of the card releases the recording under the owner’s id', async () => {
    const made = await addCard('owner', 'd1', { front: 'hola', back: 'hello', backSound: sound('a') });
    const id = (made as { card: { id: string } }).card.id;
    expect(await deleteCard('ed', id)).toEqual({ ok: true });
    expect(db.media!.find((m) => m.id === 'm1')).toBeUndefined();
  });
});

describe('what an editor reads', () => {
  beforeEach(async () => {
    accept('d1', 'ed');
    (db.decks as { id: string; folderId?: string; notifyUpdates?: boolean }[])[0]!.folderId = 'owners-folder';
    await importCards('owner', 'd1', [{ front: 'a', back: 'b' }]);
  });

  it('the deck page serves an editor the cards but none of the owner’s fields', async () => {
    const detail = await getDeck('d1', { id: 'ed' });
    expect(detail?.deck).toMatchObject({ role: 'editor', isOwner: false, notifyUpdates: true });
    expect(detail?.deck).not.toHaveProperty('folderId');
    expect(detail?.cards).toHaveLength(1);
    expect(detail?.invitation).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain('owners-folder');
    expect((await getDeck('d1', { id: 'owner' }))?.deck).toMatchObject({ folderId: 'owners-folder' });
  });

  it('a public deck shows "by the owner with N editors", counts and no names', async () => {
    accept('pub', 'ed');
    accept('pub', 'other');
    const detail = await getDeck('pub', { id: 'third' });
    expect(detail?.deck.byline).toEqual({ owner: { name: 'OWNER', handle: 'owner' }, editors: 2 });
    expect(JSON.stringify(detail?.deck.byline)).not.toMatch(/ED|other/);
  });

  it('a pending editor and a stranger do not get the deck; the listing is the owner’s own and the shared ones', async () => {
    editorRows().push({
      deckId: 'd1',
      userId: 'pending',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DAY),
    });
    expect(await getDeck('d1', { id: 'other' })).toBeNull();
    expect(await getDeck('d1', { id: null })).toBeNull();
    expect(await canReadDeck('pending', { id: 'd1', isPublic: false, userId: 'owner' })).toBe(false);
  });

  it('the filters say the same thing as the rule: accepted editors only', async () => {
    editorRows().push({
      deckId: 'd1',
      userId: 'pending',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DAY),
    });
    const count = (where: object) => prisma.flashcardDeck.count({ where });
    expect(await count({ id: 'd1', ...studiedDeckWhere('ed') })).toBe(1);
    expect(await count({ id: 'd1', ...studiedDeckWhere('owner') })).toBe(1);
    expect(await count({ id: 'd1', ...studiedDeckWhere('pending') })).toBe(0);
    expect(await count({ id: 'd1', ...studiedDeckWhere('other') })).toBe(0);
    expect(await count({ id: 'd1', ...readableDeckWhere('ed') })).toBe(1);
    expect(await count({ id: 'd1', ...readableDeckWhere('pending') })).toBe(0);
    expect(await count({ id: 'pub', ...readableDeckWhere('pending') })).toBe(1);
  });

  it('a block either way, or a ban, ends an editor’s access', async () => {
    db.blocks = [{ id: 'b', blockerId: 'ed', blockedId: 'owner' }];
    expect(await deckRole('ed', 'd1')).toBeNull();
    db.blocks = [];
    expect(await deckRole('ed', 'd1')).toBe('editor');
    (db.users as { id: string; bannedUntil?: Date }[]).find((u) => u.id === 'ed')!.bannedUntil = new Date(
      Date.now() + DAY,
    );
    expect(await deckRole('ed', 'd1')).toBeNull();
    expect(refused((await addCard('ed', 'd1', { front: 'x', back: 'y' })) as never)).toMatchObject({ status: 404 });
  });
});

describe('a pending invitee reads only the invitation', () => {
  beforeEach(async () => {
    await importCards('owner', 'd1', [{ front: 'secret', back: 'answer' }]);
    await editors.inviteEditor('owner', 'd1', 'ed', NOW);
  });

  it('gets the title and the owner’s name, and no cards, counts or description', async () => {
    const detail = await getDeck('d1', { id: 'ed' });
    expect(detail).not.toBeNull();
    expect(isInvitationOnly(detail!)).toBe(true);
    expect(detail?.invitation).toMatchObject({ deckId: 'd1', title: 'Spanish', owner: { name: 'OWNER' } });
    expect(detail).toMatchObject({ cards: [], reviewCount: 0, rowCount: 0, dueCount: 0, suspendedCount: 0 });
    expect(detail?.deck).toMatchObject({ role: null, cardCount: 0, description: null });
    expect(JSON.stringify(detail)).not.toMatch(/secret|answer/);
  });

  it('can read, test, write and list nothing else of the deck', async () => {
    expect(await getTestCards('d1', 'ed')).toEqual([]);
    expect(await addCard('ed', 'd1', { front: 'x', back: 'y' })).toMatchObject({ ok: false, status: 404 });
    expect(await importCards('ed', 'd1', [{ front: 'x', back: 'y' }])).toMatchObject({ ok: false, status: 404 });
    expect(refused(await editors.listEditors('ed', 'd1', NOW))).toMatchObject({ status: 404 });
    expect(
      await recordTestResult('ed', 'd1', {
        total: 1,
        correct: 1,
        kinds: [],
        durationMs: 1,
        missedCardIds: [],
        seed: 1,
      }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(cardsOf('d1')).toHaveLength(1);
  });

  it('lists the invitation in "Shared with you" without the deck', async () => {
    const list = await listDecks('ed');
    expect(list.shared).toEqual([]);
    expect(list.invitations).toEqual([expect.objectContaining({ deckId: 'd1', title: 'Spanish' })]);
    expect(JSON.stringify(list.invitations)).not.toMatch(/secret/);
  });
});

describe('removing an editor stops every read', () => {
  beforeEach(async () => {
    await importCards('owner', 'd1', [{ front: 'a', back: 'b' }]);
    accept('d1', 'ed');
  });

  it('the deck leaves "Shared with you", and their cards stay in the deck', async () => {
    await addCard('ed', 'd1', { front: 'mine', back: 'theirs' });
    expect((await listDecks('ed')).shared).toEqual([expect.objectContaining({ id: 'd1', owner: expect.any(Object) })]);
    expect(await editors.removeEditor('owner', 'd1', 'ed')).toEqual({ ok: true });
    expect((await listDecks('ed')).shared).toEqual([]);
    expect(await getDeck('d1', { id: 'ed' })).toBeNull();
    expect(await getTestCards('d1', 'ed')).toEqual([]);
    expect(await deckRole('ed', 'd1')).toBeNull();
    expect(await addCard('ed', 'd1', { front: 'x', back: 'y' })).toMatchObject({ ok: false, status: 404 });
    expect(await updateCard('ed', cardsOf('d1')[0]!.id as string, { back: 'z' })).toMatchObject({ ok: false });
    expect(await reorderCards('ed', 'd1', [])).toMatchObject({ ok: false, status: 404 });
    expect(await setSuspended('ed', cardsOf('d1')[0]!.id as string, true)).toBeNull();
    expect(cardsOf('d1').map((c) => c.front)).toEqual(['a', 'mine']);
  });

  it('only the owner removes, and an editor can leave', async () => {
    expect(refused(await editors.removeEditor('ed', 'd1', 'ed'))).toMatchObject({ status: 404 });
    expect(refused(await editors.removeEditor('other', 'd1', 'ed'))).toMatchObject({ status: 404 });
    expect(await deckRole('ed', 'd1')).toBe('editor');
    expect(await editors.leaveDeck('ed', 'd1')).toEqual({ ok: true });
    expect(await deckRole('ed', 'd1')).toBeNull();
    expect(refused(await editors.leaveDeck('ed', 'd1'))).toMatchObject({ status: 404 });
  });

  it('the owner can withdraw a pending invitation, and a leaver’s review history stays', async () => {
    db.reviews = [{ id: 'r1', cardId: cardsOf('d1')[0]!.id as string, userId: 'ed', dueAt: ago(DAY) }];
    editorRows().push({
      deckId: 'd1',
      userId: 'pending',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DAY),
    });
    expect(await editors.removeEditor('owner', 'd1', 'pending')).toEqual({ ok: true });
    await editors.leaveDeck('ed', 'd1');
    expect(db.reviews).toHaveLength(1);
  });
});

describe('who sees whom in the list', () => {
  it('the owner reads every open row; an editor reads the owner and a count, no names', async () => {
    accept('d1', 'ed');
    editorRows().push({ deckId: 'd1', userId: 'other', invitedById: 'owner', status: 'pending', createdAt: ago(DAY) });
    editorRows().push({
      deckId: 'd1',
      userId: 'third',
      invitedById: 'owner',
      status: 'pending',
      createdAt: ago(DECK_INVITE_MS + DAY),
    });
    const asOwner = await editors.listEditors('owner', 'd1', NOW);
    expect(asOwner).toMatchObject({ ok: true, view: { role: 'owner', max: MAX_DECK_EDITORS } });
    const rows = (asOwner as { view: { editors: { userId: string; status: string }[] } }).view.editors;
    expect(rows.map((r) => [r.userId, r.status]).sort()).toEqual([
      ['ed', 'accepted'],
      ['other', 'pending'],
    ]);
    const asEditor = await editors.listEditors('ed', 'd1', NOW);
    expect(asEditor).toEqual({
      ok: true,
      view: { role: 'editor', owner: { name: 'OWNER', handle: 'owner' }, count: 1 },
    });
    expect(JSON.stringify(asEditor)).not.toMatch(/OTHER|THIRD/);
    expect(refused(await editors.listEditors('third', 'd1', NOW))).toMatchObject({ status: 404 });
  });

  it('"Shared with you" carries the deck, the owner’s name and the viewer’s own due count, never a folder or pace', async () => {
    accept('d1', 'ed');
    (db.decks as { folderId?: string; newPerDay?: number }[])[0]!.folderId = 'f';
    (db.decks as { folderId?: string; newPerDay?: number }[])[0]!.newPerDay = 5;
    const list = await listDecks('ed');
    expect(list.shared).toEqual([
      {
        id: 'd1',
        title: 'Spanish',
        description: null,
        cardCount: 0,
        dueCount: 0,
        owner: { name: 'OWNER', handle: 'owner' },
      },
    ]);
    expect(list.mine).toEqual([]);
    expect(JSON.stringify(list.shared)).not.toMatch(/folderId|newPerDay/);
  });
});

describe('the editor studies on their own schedule', () => {
  const fresh = (deckUserId: string, newPerDay: number | null) =>
    Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      front: 'f',
      back: 'b',
      kind: 'basic',
      sourceId: null,
      clozeIndex: null,
      deckId: 'd1',
      source: null,
      deck: { title: 'Spanish', userId: deckUserId, newPerDay, extraNewDay: null, extraNew: 0 },
    }));

  it('reads the editor’s own review rows and the decks they edit', async () => {
    await reviewQueue('ed', undefined, NOW);
    const scheduled = reviewFindMany.mock.calls[0]![0] as { where: { userId: string; card: { deck: unknown } } };
    expect(scheduled.where.userId).toBe('ed');
    expect(scheduled.where.card.deck).toEqual(readableDeckWhere('ed'));
    const newCards = cardFindMany.mock.calls[0]![0] as { where: { deck: unknown; reviews: unknown } };
    expect(newCards.where.deck).toEqual(studiedDeckWhere('ed'));
    expect(newCards.where.reviews).toEqual({ none: { userId: 'ed' } });
  });

  it('the owner’s pace is not the editor’s: the editor gets the session rule, the owner the pace', async () => {
    cardFindMany.mockResolvedValueOnce(fresh('owner', 5));
    const asEditor = await reviewQueue('ed', undefined, NOW);
    expect(asEditor.cards).toHaveLength(20);
    expect(asEditor.learnMore).toBeUndefined();
    // The owner's session: the pace holds it to five, and the deck is read again for the cards after it (none).
    cardFindMany.mockResolvedValueOnce(fresh('owner', 5)).mockResolvedValueOnce([]);
    const asOwner = await reviewQueue('owner', undefined, NOW);
    expect(asOwner.cards).toHaveLength(5);
  });

  it('due counts and statistics name the real table and quoted columns, and the pace columns are the owner’s only', async () => {
    await dueByDeck('ed', NOW);
    const sql = raw[0]!.sql;
    expect(sql).toMatch(/FROM deck_editor e/);
    expect(sql).toMatch(/e\."deckId" = d\."id" AND e\."userId" = \? AND e\."status" = 'accepted'/);
    expect(sql).toMatch(/MAX\(CASE WHEN d\."userId" = \? THEN d\."newPerDay" END\)/);
    expect(sql).toMatch(/"suspendedAt" IS NULL/);
    raw.length = 0;
    await getStudyStats('ed', { timeZone: 'UTC' });
    const flat = (value: unknown): string =>
      typeof value === 'object' && value !== null && 'strings' in value
        ? (value as unknown as { strings: string[]; values: unknown[] }).strings.reduce(
            (out, piece, i) => out + piece + (i < (value as unknown as { values: unknown[] }).values.length ? '?' : ''),
            '',
          )
        : '';
    const decks = raw.map((r) => r.sql + r.values.map(flat).join('')).find((s) => s.includes('flashcard_deck d'))!;
    expect(decks).toMatch(/deck_editor e WHERE e\."deckId" = d\.id AND e\."userId" = \? AND e\."status" = 'accepted'/);
  });

  it('the table and columns the SQL names are the schema’s', () => {
    const schema = readFileSync(join(__dirname, '..', '..', '..', 'prisma/schema/rmhstudy.prisma'), 'utf8');
    const model = schema.slice(schema.indexOf('model DeckEditor {'));
    const body = model.slice(0, model.indexOf('\n}\n'));
    expect(body).toMatch(/@@map\("deck_editor"\)/);
    for (const column of ['deckId', 'userId', 'status']) expect(body).toMatch(new RegExp(`\\n  ${column}\\s`));
    expect(body).toMatch(/@@id\(\[deckId, userId\]\)/);
    const migration = readFileSync(
      join(__dirname, '..', '..', '..', 'prisma/migrations/20261201020200_s11_deck_coeditors/migration.sql'),
      'utf8',
    );
    expect(migration).toMatch(/CREATE TABLE "deck_editor"/);
    expect(migration).toMatch(/ON DELETE CASCADE/);
  });

  it('the invitation lapses at fourteen days exactly', () => {
    expect(inviteOpen(new Date(NOW.getTime() - DECK_INVITE_MS + 1), NOW)).toBe(true);
    expect(inviteOpen(new Date(NOW.getTime() - DECK_INVITE_MS), NOW)).toBe(false);
  });
});

describe('the export', () => {
  it('lists the decks the member edits and the invitations they sent', async () => {
    accept('d1', 'ed');
    editorRows().push({ deckId: 'pub', userId: 'other', invitedById: 'owner', status: 'pending', createdAt: ago(DAY) });
    const forEditor = await editors.exportDeckEditors('ed');
    expect(forEditor.editing).toEqual([
      { deckId: 'd1', title: 'Spanish', owner: 'OWNER', acceptedAt: ago(DAY).toISOString() },
    ]);
    expect(forEditor.invitationsSent).toEqual([]);
    const forOwner = await editors.exportDeckEditors('owner');
    expect(forOwner.editing).toEqual([]);
    expect(forOwner.invitationsSent.map((r) => [r.deckId, r.editor, r.status]).sort()).toEqual([
      ['d1', 'ed', 'accepted'],
      ['pub', 'other', 'pending'],
    ]);
  });
});
