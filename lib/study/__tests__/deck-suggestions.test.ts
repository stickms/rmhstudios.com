import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardHash } from '@/lib/study/deck-sync';

// Suggested corrections (s10-04): who may suggest, the caps under their locks, the duplicate and no-change refusals,
// accept through `updateCardIn` in the decision's transaction (once), decline with a reason, withdraw by the suggester.

interface Deck {
  id: string;
  userId: string;
  title: string;
  isPublic: boolean;
  acceptsSuggestions: boolean;
  clonedFromId: string | null;
  cardsChangedAt: Date | null;
}
interface Card {
  id: string;
  deckId: string;
  sourceId: string | null;
  kind: string;
  front: string;
  back: string;
  originCardId: string | null;
}
interface Sug {
  id: string;
  deckId: string;
  cardId: string;
  suggesterId: string;
  front: string;
  back: string;
  note: string | null;
  baseHash: string;
  status: string;
  declineReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}
interface User {
  id: string;
  name: string;
  createdAt: Date;
  bannedUntil: Date | null;
  deletionScheduledAt?: Date | null;
}

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  sugs: [] as unknown[],
  users: [] as unknown[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  locks: [] as string[],
  events: [] as string[],
  notices: [] as Record<string, unknown>[],
  applied: [] as unknown[],
  failApply: false,
  next: 1,
}));
const D = () => db.decks as Deck[];
const C = () => db.cards as Card[];
const S = () => db.sugs as Sug[];
const U = () => db.users as User[];

/** A where-clause as these queries write it: plain equality, `OR`, and one-hop relations. */
function matches(model: string, row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, want]) => {
    if (key === 'OR') return (want as Record<string, unknown>[]).some((w) => matches(model, row, w));
    if (key === 'deck' && typeof want === 'object' && want !== null) {
      const deck = D().find((d) => d.id === row.deckId);
      return !!deck && matches('deck', deck as unknown as Record<string, unknown>, want as Record<string, unknown>);
    }
    return row[key] === want;
  });
}

const makeTx = () => ({
  $executeRaw: vi.fn(async () => 0),
  flashcardDeck: {
    findUnique: async ({ where }: { where: { id: string } }) => D().find((d) => d.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      D().find((d) => matches('deck', d as unknown as Record<string, unknown>, where)) ?? null,
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => U().find((u) => u.id === where.id) ?? null,
  },
  // Nobody edits a deck here (s11-10): the access rule that refuses an editor reads this and finds no row.
  deckEditor: { findUnique: async () => null },
  userBlock: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      db.blocks.find((b) => matches('block', b, where)) ?? null,
  },
  flashcard: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      C().find((c) => matches('card', c as unknown as Record<string, unknown>, where)) ?? null,
  },
  deckSuggestion: {
    count: async ({ where }: { where: Record<string, unknown> }) =>
      S().filter((s) => matches('sug', s as unknown as Record<string, unknown>, where)).length,
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      S().find((s) => matches('sug', s as unknown as Record<string, unknown>, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => {
      const s = S().find((x) => x.id === where.id);
      if (!s) return null;
      return { ...s, deck: D().find((d) => d.id === s.deckId) };
    },
    create: async ({ data }: { data: Partial<Sug> }) => {
      const row = {
        id: `s${db.next++}`,
        note: null,
        status: 'open',
        declineReason: null,
        decidedAt: null,
        createdAt: new Date(2026, 11, 1, 0, 0, db.next),
        ...data,
      } as Sug;
      S().push(row);
      db.events.push('create');
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Sug> }) => {
      const rows = S().filter((s) => matches('sug', s as unknown as Record<string, unknown>, where));
      for (const r of rows) Object.assign(r, data);
      db.events.push(`updateMany:${String(data.status)}:${rows.length}`);
      return { count: rows.length };
    },
  },
});

const prismaMock = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: async (_tx: unknown, key: string) => {
    db.locks.push(key);
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: Record<string, unknown>) => {
    db.notices.push(n);
  },
}));
vi.mock('@/lib/study/card-images.server', () => ({ deleteCardImageObjects: async () => {} }));
vi.mock('@/lib/study/deck-editor.server', () => ({
  updateCardIn: async (tx: unknown, userId: string, cardId: string, patch: { front: string; back: string }) => {
    db.applied.push({ tx, userId, cardId, patch });
    if (db.failApply) return { ok: false, status: 400, error: 'Invalid card' };
    const card = C().find((c) => c.id === cardId)!;
    card.front = patch.front;
    card.back = patch.back;
    // What the real `updateCardIn` ends with: the deck's `cardsChangedAt` is stamped.
    D().find((d) => d.id === card.deckId)!.cardsChangedAt = new Date();
    return { ok: true, released: [] };
  },
}));

const { createSuggestion, decideSuggestion, withdrawSuggestion, listForAuthor, exportDeckSuggestions } =
  await import('@/lib/study/suggestions.server');

const NOW = Date.now();
const OLD = new Date(NOW - 30 * 24 * 3600 * 1000);
const input = { cardId: 'c1', front: 'Capital of France', back: 'Paris, France' };

beforeEach(() => {
  const tx = makeTx();
  Object.assign(prismaMock, tx, {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const snapshot = JSON.stringify(S());
      try {
        return await fn(tx);
      } catch (error) {
        db.sugs = JSON.parse(snapshot, (k, v: unknown) =>
          (k === 'decidedAt' || k === 'createdAt') && typeof v === 'string' ? new Date(v) : v,
        ) as unknown[];
        throw error;
      }
    },
  });
  db.decks = [
    {
      id: 'd1',
      userId: 'author',
      title: 'French',
      isPublic: true,
      acceptsSuggestions: true,
      clonedFromId: null,
      cardsChangedAt: null,
    },
  ] satisfies Deck[];
  db.cards = [
    {
      id: 'c1',
      deckId: 'd1',
      sourceId: null,
      kind: 'basic',
      front: 'Capital of France',
      back: 'Paris',
      originCardId: null,
    },
    { id: 'c2', deckId: 'd1', sourceId: null, kind: 'occlusion', front: '', back: '', originCardId: null },
  ] satisfies Card[];
  db.sugs = [];
  db.users = [
    { id: 'author', name: 'Author', createdAt: OLD, bannedUntil: null },
    { id: 'me', name: 'Me', createdAt: OLD, bannedUntil: null },
    { id: 'other', name: 'Other', createdAt: OLD, bannedUntil: null },
  ] satisfies User[];
  db.blocks = [];
  db.locks = [];
  db.events = [];
  db.notices = [];
  db.applied = [];
  db.failApply = false;
  db.next = 1;
});

const open = (over: Partial<Sug> = {}): Sug => {
  const row: Sug = {
    id: `s${db.next++}`,
    deckId: 'd1',
    cardId: 'c1',
    suggesterId: 'me',
    front: 'Capital of France',
    back: `Paris ${db.next}`,
    note: null,
    baseHash: 'x',
    status: 'open',
    declineReason: null,
    decidedAt: null,
    createdAt: new Date(2026, 11, 1),
    ...over,
  };
  S().push(row);
  return row;
};

describe('who may suggest', () => {
  it('stores a suggestion with the card hash it was made against', async () => {
    const res = await createSuggestion('me', 'd1', { ...input, note: ' typo ' });
    expect(res.ok).toBe(true);
    const row = S()[0]!;
    expect(row).toMatchObject({ status: 'open', suggesterId: 'me', note: 'typo', back: 'Paris, France' });
    expect(row.baseHash).toBe(cardHash({ kind: 'basic', front: 'Capital of France', back: 'Paris' }));
    // The author hears once, deduped on the deck.
    expect(db.notices[0]).toMatchObject({
      userId: 'author',
      type: 'SYSTEM',
      entityId: 'd1',
      dedupeUnread: true,
      preview: { key: 'deck-suggestions-new', params: { deck: 'French' } },
    });
  });

  it('refuses the author of the deck', async () => {
    expect(await createSuggestion('author', 'd1', input)).toMatchObject({ ok: false, reason: 'own-deck' });
  });

  it('refuses a member blocked in either direction', async () => {
    db.blocks.push({ blockerId: 'author', blockedId: 'me' });
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'blocked' });
    db.blocks = [{ blockerId: 'me', blockedId: 'author' }];
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'blocked' });
  });

  it('refuses a banned member and an account under seven days old', async () => {
    U()[1]!.bannedUntil = new Date(NOW + 3600_000);
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'banned' });
    U()[1]!.bannedUntil = new Date(NOW - 3600_000);
    U()[1]!.deletionScheduledAt = new Date(NOW + 86_400_000);
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'banned' });
    U()[1]!.deletionScheduledAt = null;
    U()[1]!.createdAt = new Date(NOW - 6 * 24 * 3600 * 1000);
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'too-new' });
  });

  it('refuses a deck that has not turned suggestions on, whatever else is true', async () => {
    D()[0]!.acceptsSuggestions = false;
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 403, reason: 'off' });
    expect(S()).toHaveLength(0);
  });

  it('refuses a private deck unless the member holds a copy, and then reads their own copy', async () => {
    D()[0]!.isPublic = false;
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 404, reason: 'not-found' });
    D().push({
      id: 'copy',
      userId: 'me',
      title: 'French',
      isPublic: false,
      acceptsSuggestions: false,
      clonedFromId: 'd1',
      cardsChangedAt: null,
    });
    // No copy card for c1 yet: nothing to read.
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, reason: 'not-found' });
    C().push({
      id: 'k1',
      deckId: 'copy',
      sourceId: null,
      kind: 'basic',
      front: 'Capital of France',
      back: 'Paris',
      originCardId: 'c1',
    });
    expect((await createSuggestion('me', 'd1', input)).ok).toBe(true);
    // "No change" is measured against the member's own copy, never the private source.
    expect(await createSuggestion('me', 'd1', { ...input, back: 'Paris' })).toMatchObject({ reason: 'no-change' });
  });

  it('refuses an occlusion card and a card of another deck', async () => {
    expect(await createSuggestion('me', 'd1', { cardId: 'c2', front: 'x', back: 'y' })).toMatchObject({
      ok: false,
      reason: 'not-suggestable',
    });
    expect(await createSuggestion('me', 'd1', { cardId: 'nope', front: 'x', back: 'y' })).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
  });

  it('refuses a suggestion that changes nothing (after trimming) and a duplicate of an open one', async () => {
    expect(
      await createSuggestion('me', 'd1', { ...input, front: ' Capital of France ', back: ' Paris ' }),
    ).toMatchObject({
      ok: false,
      reason: 'no-change',
    });
    expect((await createSuggestion('me', 'd1', input)).ok).toBe(true);
    expect(await createSuggestion('me', 'd1', { ...input, back: ' Paris, France ' })).toMatchObject({
      ok: false,
      status: 409,
      reason: 'duplicate',
    });
  });

  it('lets two members suggest the same correction: a duplicate is refused only against the own open ones', async () => {
    expect((await createSuggestion('me', 'd1', input)).ok).toBe(true);
    expect((await createSuggestion('other', 'd1', { ...input, back: ' Paris, France ' })).ok).toBe(true);
    expect(
      S()
        .filter((x) => x.status === 'open')
        .map((x) => x.suggesterId),
    ).toEqual(['me', 'other']);
  });
});

describe('the caps and their locks', () => {
  it('takes the deck lock, then the member lock, before it counts', async () => {
    await createSuggestion('me', 'd1', input);
    expect(db.locks).toEqual(['deck-suggest:d1', 'deck-suggest:d1:me']);
  });

  it('refuses the 21st open suggestion from one member on one deck', async () => {
    for (let i = 0; i < 20; i++) open({ suggesterId: 'me' });
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 409, reason: 'member-cap' });
    // Another member is not held back by it.
    expect((await createSuggestion('other', 'd1', input)).ok).toBe(true);
  });

  it('refuses the 201st open suggestion on a deck, and decided ones do not count', async () => {
    for (let i = 0; i < 200; i++) open({ suggesterId: `u${i % 50}` });
    expect(await createSuggestion('me', 'd1', input)).toMatchObject({ ok: false, status: 409, reason: 'deck-cap' });
    S()[0]!.status = 'declined';
    expect((await createSuggestion('me', 'd1', input)).ok).toBe(true);
    expect(db.locks.slice(0, 2)).toEqual(['deck-suggest:d1', 'deck-suggest:d1:me']);
  });
});

describe('the author decides', () => {
  it('accepts through updateCardIn in the same transaction and stamps cardsChangedAt', async () => {
    const row = open({ back: 'Paris, France' });
    const res = await decideSuggestion('author', row.id, { decision: 'accept' });
    expect(res).toMatchObject({ ok: true, status: 'accepted' });
    expect(db.applied).toHaveLength(1);
    expect(db.applied[0]).toMatchObject({
      userId: 'author',
      cardId: 'c1',
      patch: { front: 'Capital of France', back: 'Paris, France' },
    });
    // `updateCardIn` ran on the transaction client, not the global one.
    expect((db.applied[0] as { tx: unknown }).tx).not.toBe(prismaMock);
    expect(C()[0]!.back).toBe('Paris, France');
    expect(D()[0]!.cardsChangedAt).toBeInstanceOf(Date);
    expect(S()[0]!.status).toBe('accepted');
    expect(db.notices[0]).toMatchObject({ userId: 'me', preview: { key: 'deck-suggestion-accepted' } });
  });

  it('a second accept of the same suggestion does nothing', async () => {
    const row = open({ back: 'Paris, France' });
    await decideSuggestion('author', row.id, { decision: 'accept' });
    const again = await decideSuggestion('author', row.id, { decision: 'accept' });
    expect(again).toMatchObject({ ok: false, status: 409, reason: 'already-decided' });
    expect(db.applied).toHaveLength(1);
    expect(db.notices).toHaveLength(1);
  });

  it('accept with edits applies the author wording', async () => {
    const row = open();
    await decideSuggestion('author', row.id, {
      decision: 'accept',
      edit: { front: 'Capital of France', back: 'Paris (city)' },
    });
    expect(db.applied[0]).toMatchObject({ patch: { back: 'Paris (city)' } });
  });

  it('writes nothing when the card no longer takes the text', async () => {
    const row = open();
    db.failApply = true;
    const res = await decideSuggestion('author', row.id, { decision: 'accept' });
    expect(res).toMatchObject({ ok: false, reason: 'invalid' });
    expect(S()[0]!.status).toBe('open');
    expect(db.notices).toHaveLength(0);
  });

  it('never applies to a card that became an occlusion card', async () => {
    const row = open({ cardId: 'c2' });
    expect(await decideSuggestion('author', row.id, { decision: 'accept' })).toMatchObject({
      reason: 'not-suggestable',
    });
    expect(db.applied).toHaveLength(0);
  });

  it('only the deck author decides', async () => {
    const row = open();
    expect(await decideSuggestion('me', row.id, { decision: 'accept' })).toMatchObject({ ok: false, status: 404 });
    expect(await decideSuggestion('other', row.id, { decision: 'decline' })).toMatchObject({ ok: false, status: 404 });
    expect(S()[0]!.status).toBe('open');
  });

  it('decline stores the reason and tells the suggester with it', async () => {
    const row = open();
    const res = await decideSuggestion('author', row.id, { decision: 'decline', reason: ' Paris is right ' });
    expect(res).toMatchObject({ ok: true, status: 'declined', declined: 1 });
    expect(S()[0]).toMatchObject({ status: 'declined', declineReason: 'Paris is right' });
    expect(db.notices[0]).toMatchObject({
      userId: 'me',
      preview: { key: 'deck-suggestion-declined', params: { deck: 'French', reason: 'Paris is right' } },
    });
  });

  it('decline and block declines every open suggestion from that member, silently', async () => {
    const first = open();
    open();
    open({ suggesterId: 'other' });
    const res = await decideSuggestion('author', first.id, { decision: 'decline', block: true });
    expect(res).toMatchObject({ ok: true, declined: 2 });
    expect(
      S()
        .filter((s) => s.suggesterId === 'me')
        .every((s) => s.status === 'declined'),
    ).toBe(true);
    expect(S().find((s) => s.suggesterId === 'other')!.status).toBe('open');
    expect(db.notices).toHaveLength(0);
  });

  it('decline and block that loses the race still declines the rest and reports already-decided', async () => {
    const first = open({ status: 'declined' });
    open();
    open({ suggesterId: 'other' });
    const res = await decideSuggestion('author', first.id, { decision: 'decline', block: true });
    expect(res).toMatchObject({ ok: false, status: 409, reason: 'already-decided', declined: 1 });
    expect(
      S()
        .filter((x) => x.suggesterId === 'me')
        .every((x) => x.status === 'declined'),
    ).toBe(true);
    expect(S().find((x) => x.suggesterId === 'other')!.status).toBe('open');
  });

  it('a plain decline that loses the race blocks nobody', async () => {
    const first = open({ status: 'declined' });
    const second = open();
    const res = await decideSuggestion('author', first.id, { decision: 'decline' });
    expect(res).toMatchObject({ ok: false, reason: 'already-decided' });
    expect(S().find((x) => x.id === second.id)!.status).toBe('open');
  });

  it('lists open suggestions oldest first and marks a card that changed since', async () => {
    const hash = cardHash({ kind: 'basic', front: 'Capital of France', back: 'Paris' });
    open({ id: 'late', createdAt: new Date(2026, 11, 3), baseHash: hash });
    open({ id: 'early', createdAt: new Date(2026, 11, 2), baseHash: 'old' });
    (prismaMock.deckSuggestion as Record<string, unknown>).findMany = async () => {
      return [...S()]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((s) => ({
          ...s,
          card: C().find((c) => c.id === s.cardId),
          suggester: { id: s.suggesterId, name: 'Me', profile: null },
        }));
    };
    const res = await listForAuthor('author', 'd1');
    expect(res.ok && res.suggestions.map((s) => [s.id, s.stale])).toEqual([
      ['early', true],
      ['late', false],
    ]);
    expect(await listForAuthor('me', 'd1')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('withdraw', () => {
  it('lets only the suggester withdraw an open suggestion, once', async () => {
    const row = open();
    expect(await withdrawSuggestion('other', row.id)).toMatchObject({ ok: false, status: 404 });
    expect(await withdrawSuggestion('author', row.id)).toMatchObject({ ok: false, status: 404 });
    expect(await withdrawSuggestion('me', row.id)).toEqual({ ok: true });
    expect(S()[0]!.status).toBe('withdrawn');
    expect(await withdrawSuggestion('me', row.id)).toMatchObject({ ok: false, status: 409 });
  });
});

describe('export', () => {
  it('reads only the suggestions the member made', async () => {
    (prismaMock.deckSuggestion as Record<string, unknown>).findMany = vi.fn(async () => []);
    await exportDeckSuggestions('me');
    const call = (prismaMock.deckSuggestion as { findMany: ReturnType<typeof vi.fn> }).findMany.mock.calls[0]![0];
    expect(call.where).toEqual({ suggesterId: 'me' });
  });
});
