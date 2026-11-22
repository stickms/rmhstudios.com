/**
 * Pictures on flashcards (s08-15), the server side, against the in-memory study database: a picture needs a
 * description, a cloze front takes none, the per-member cap holds under its lock, a picture must be the member's own
 * upload and is claimed on save, a copy SHARES the object (the author removing it keeps it for the copy, the last
 * reference deletes it), a picture change reaches the copier as an update, and the API refuses foreign media.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeCard, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  media: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
const deleted = vi.hoisted(() => [] as string[]);
const ingestMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
// The head of a still WebP (RIFF, WEBP, a VP8X chunk with no animation flag): what every stored picture reads as here.
const STILL_WEBP_HEAD = vi.hoisted(() =>
  Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0', 'latin1'),
);
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: async (key: string) => {
    deleted.push(key);
  },
  getObjectRange: async () => ({ body: STILL_WEBP_HEAD, contentType: 'image/webp', start: 0, end: 31, total: 32 }),
}));
vi.mock('@/lib/media/ingest.server', () => ({
  ingest: ingestMock,
  POLICIES: { flashcard: { mime: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 } },
  IngestError: class IngestError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return { prisma: { ...prisma, $queryRaw: vi.fn(async () => [] as unknown[]) } };
});

const { addCard, deleteCard, deleteDeck, importCardsDetailed, updateCard, upsertCardByExternalId } =
  await import('@/lib/study/deck-editor.server');
const { cloneDeck } = await import('@/lib/study.server');
const { applyUpdates, deckUpdates } = await import('@/lib/study/deck-sync.server');
const { cardHash } = await import('@/lib/study/deck-sync');
const { uploadCardImage, exportCardImages } = await import('@/lib/study/card-images.server');
const { createMyCards, patchMyCard, upsertMyCard } = await import('@/lib/api/v1/study.server');
const { MAX_CARD_IMAGES } = await import('@/lib/study/card-images');

const urlOf = (name: string) => `/api/feed/image/${name}.webp`;
const media = (id: string, userId: string, status: 'PENDING' | 'ATTACHED' = 'PENDING') => ({
  id,
  userId,
  key: `rmharks/${id}.webp`,
  url: urlOf(id),
  contentType: 'image/webp',
  bytes: 1000,
  status,
});
const pic = (id: string, alt = 'A heart cut in half') => ({ url: urlOf(id), alt });
const cards = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const mediaIds = () => (db.media ?? []).map((m) => m.id).sort();

beforeEach(() => {
  Object.assign(db, newFakeDb());
  deleted.length = 0;
  ingestMock.mockReset();
  db.decks = [
    { id: 'mine', userId: 'me', title: 'Mine', description: null, isPublic: false, cardCount: 0 },
    { id: 'pub', userId: 'author', title: 'Pub', description: null, isPublic: true, cardCount: 0 },
  ];
  db.media = [media('m1', 'me'), media('m2', 'me'), media('a1', 'author'), media('a2', 'author')];
});

describe('a picture needs a description', () => {
  it('refuses a picture with a blank description and writes nothing', async () => {
    const before = db.writes;
    const res = await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1', '   ') });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.writes).toBe(before);
    expect(cards('mine')).toHaveLength(0);
    expect(db.media?.find((m) => m.id === 'm1')?.status).toBe('PENDING');
  });

  it('refuses a picture on a cloze front, and takes one on its back', async () => {
    const text = 'The {{c1::heart}} pumps blood.';
    expect(await addCard('me', 'mine', { kind: 'cloze', front: text, frontImage: pic('m1') })).toMatchObject({
      ok: false,
      status: 400,
    });
    const ok = await addCard('me', 'mine', { kind: 'cloze', front: text, backImage: pic('m1') });
    expect(ok).toMatchObject({ ok: true });
    expect(cards('mine')[0]).toMatchObject({ backImageUrl: urlOf('m1'), backImageAlt: 'A heart cut in half' });
  });

  it('refuses an edit that would leave a picture undescribed, and a switch to cloze with a front picture', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const id = cards('mine')[0]!.id;
    expect(await updateCard('me', id, { frontImage: { url: urlOf('m1'), alt: '' } })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await updateCard('me', id, { kind: 'cloze', front: 'The {{c1::heart}}' })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(cards('mine')[0]!.frontImageAlt).toBe('A heart cut in half');
  });
});

describe('only the member’s own upload can be attached', () => {
  it('claims a pending upload on save', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    expect(db.media?.find((m) => m.id === 'm1')?.status).toBe('ATTACHED');
    expect(db.locks).toContain('card-images:me');
  });

  it('refuses another member’s upload, and an address that was never ingested', async () => {
    const before = db.writes;
    expect(await addCard('me', 'mine', { front: 'a', back: 'b', frontImage: pic('a1') })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await addCard('me', 'mine', { front: 'a', back: 'b', frontImage: { url: 'https://evil.test/x.png', alt: 'x' } }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(db.writes).toBe(before);
    expect(db.media?.find((m) => m.id === 'a1')?.status).toBe('PENDING');
  });

  it('re-checks the flashcard policy at the claim: a pending upload of the member that is not a still image, or is over the cap, is refused', async () => {
    db.media?.push(
      { ...media('g1', 'me'), contentType: 'image/gif' },
      { ...media('big1', 'me'), bytes: 6 * 1024 * 1024 },
    );
    for (const id of ['g1', 'big1']) {
      expect(await addCard('me', 'mine', { front: 'a', back: 'b', frontImage: pic(id) })).toMatchObject({
        ok: false,
        status: 400,
      });
      expect(db.media?.find((m) => m.id === id)?.status).toBe('PENDING');
    }
  });

  it('an import can reuse a picture one of the member’s cards already shows, but not a stray attached one', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const again = await importCardsDetailed('me', 'mine', [{ front: 'Atrium', back: 'Chamber', backImage: pic('m1') }]);
    expect(again).toMatchObject({ ok: true });
    db.media?.push(media('m3', 'me', 'ATTACHED'));
    const stray = await importCardsDetailed('me', 'mine', [{ front: 'x', back: 'y', backImage: pic('m3') }]);
    expect(stray).toMatchObject({ ok: false, status: 400 });
  });
});

describe('the cap on cards carrying a picture', () => {
  const fill = (n: number, extra: Partial<FakeCard> = {}) => {
    for (let i = 0; i < n; i++) {
      db.cards.push({
        id: `p${i}${extra.originCardId ? 'c' : ''}`,
        deckId: 'mine',
        front: `f${i}`,
        back: 'b',
        position: i,
        frontImageUrl: urlOf(`old${i}`),
        frontImageAlt: 'old',
        ...extra,
      });
    }
  };

  it('refuses the 501st card under the member’s lock', async () => {
    fill(MAX_CARD_IMAGES);
    const res = await addCard('me', 'mine', { front: 'one more', back: 'x', frontImage: pic('m1') });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(db.locks).toContain('card-images:me');
    expect(db.media?.find((m) => m.id === 'm1')?.status).toBe('PENDING');
  });

  it('allows the 500th, and a card without a picture at any time', async () => {
    fill(MAX_CARD_IMAGES - 1);
    expect(await addCard('me', 'mine', { front: 'last', back: 'x', frontImage: pic('m1') })).toMatchObject({
      ok: true,
    });
    expect(await addCard('me', 'mine', { front: 'plain', back: 'x' })).toMatchObject({ ok: true });
  });

  it('does not count copied pictures: the copier did not upload them', async () => {
    fill(MAX_CARD_IMAGES, { originCardId: 'src' });
    expect(await addCard('me', 'mine', { front: 'mine', back: 'x', frontImage: pic('m1') })).toMatchObject({
      ok: true,
    });
  });

  it('counts an import by its pictured cards', async () => {
    fill(MAX_CARD_IMAGES - 1);
    const res = await importCardsDetailed('me', 'mine', [
      { front: 'a', back: 'b', frontImage: pic('m1') },
      { front: 'c', back: 'd', frontImage: pic('m2') },
    ]);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });
});

describe('releasing a picture', () => {
  it('deletes the object and its row when the card drops it, the variant included', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const id = cards('mine')[0]!.id;
    expect(await updateCard('me', id, { frontImage: null })).toEqual({ ok: true });
    expect(mediaIds()).not.toContain('m1');
    expect(deleted).toEqual(['rmharks/m1.webp', 'rmharks/m1-400.webp']);
    expect(cards('mine')[0]).toMatchObject({ frontImageUrl: null, frontImageAlt: null });
  });

  it('replacing a picture releases the old one and claims the new', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const id = cards('mine')[0]!.id;
    await updateCard('me', id, { frontImage: pic('m2', 'A different heart') });
    expect(mediaIds()).not.toContain('m1');
    expect(db.media?.find((m) => m.id === 'm2')?.status).toBe('ATTACHED');
  });

  it('deleting the card, or the deck, releases its pictures', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    await addCard('me', 'mine', { front: 'Lung', back: 'Organ', backImage: pic('m2') });
    expect(await deleteCard('me', cards('mine')[0]!.id)).toEqual({ ok: true });
    expect(mediaIds()).not.toContain('m1');
    expect(await deleteDeck('me', 'mine')).toEqual({ ok: true });
    expect(mediaIds()).not.toContain('m2');
    expect(deleted.sort()).toEqual([
      'rmharks/m1-400.webp',
      'rmharks/m1.webp',
      'rmharks/m2-400.webp',
      'rmharks/m2.webp',
    ]);
  });

  it('a pasted address with no upload row releases nothing', async () => {
    db.cards.push({
      id: 'c1',
      deckId: 'mine',
      front: 'a',
      back: 'b',
      position: 0,
      frontImageUrl: urlOf('ghost'),
      frontImageAlt: 'x',
    });
    expect(await updateCard('me', 'c1', { frontImage: null })).toEqual({ ok: true });
    expect(deleted).toEqual([]);
  });
});

describe('copies share the picture object', () => {
  const author = async () => {
    await addCard('author', 'pub', { front: 'Heart', back: 'Organ', frontImage: pic('a1') });
    await addCard('author', 'pub', { front: 'Lung', back: 'Organ' });
    db.decks.find((d) => d.id === 'pub')!.cardsChangedAt = new Date(Date.now() - 60_000);
  };

  it('copying keeps the URL, stores no second object and takes the picture locks', async () => {
    await author();
    const before = db.media?.length;
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const copy = cards(cloned.id).find((c) => c.front === 'Heart')!;
    expect(copy).toMatchObject({ frontImageUrl: urlOf('a1'), frontImageAlt: 'A heart cut in half' });
    expect(db.media?.length).toBe(before);
    expect(db.locks).toContain(`card-image:${urlOf('a1')}`);
  });

  it('the author removing the picture, then the card, keeps the object while a copy shows it; the last reference deletes it', async () => {
    await author();
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const source = cards('pub').find((c) => c.front === 'Heart')!;
    await updateCard('author', source.id, { frontImage: null });
    expect(mediaIds()).toContain('a1');
    expect(deleted).toEqual([]);
    expect(cards(cloned.id).find((c) => c.front === 'Heart')!.frontImageUrl).toBe(urlOf('a1'));

    const copyCard = cards(cloned.id).find((c) => c.front === 'Heart')!;
    expect(await deleteCard('me', copyCard.id)).toEqual({ ok: true });
    expect(mediaIds()).not.toContain('a1');
    expect(deleted).toEqual(['rmharks/a1.webp', 'rmharks/a1-400.webp']);
  });

  it('the author deleting the whole deck keeps a copy’s picture', async () => {
    await author();
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    expect(await deleteDeck('author', 'pub')).toEqual({ ok: true });
    expect(mediaIds()).toContain('a1');
    expect(cards(cloned.id).find((c) => c.front === 'Heart')!.frontImageUrl).toBe(urlOf('a1'));
  });

  it('a picture change is an update the copier is offered, and applying it shares the new object', async () => {
    await author();
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const source = cards('pub').find((c) => c.front === 'Heart')!;
    await updateCard('author', source.id, { frontImage: pic('a2', 'A newer diagram') });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    expect(detail.diff.changed).toHaveLength(1);
    const item = detail.diff.changed[0]!;
    expect(item.theirs.frontImage).toEqual(pic('a2', 'A newer diagram'));
    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 1 });
    const copyCard = cards(cloned.id).find((c) => c.front === 'Heart')!;
    expect(copyCard).toMatchObject({ frontImageUrl: urlOf('a2'), frontImageAlt: 'A newer diagram' });
    // a1 lost its last reference (the author replaced it, the copy followed), a2 is shared and untouched.
    expect(mediaIds()).not.toContain('a1');
    expect(mediaIds()).toContain('a2');
  });

  it('a new picture card the author adds reaches the copier with the same URL', async () => {
    await author();
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    await addCard('author', 'pub', { front: 'Kidney', back: 'Organ', backImage: pic('a2') });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    const added = detail.diff.added.find((a) => a.card.front === 'Kidney')!;
    await applyUpdates('me', cloned.id, [{ type: 'new', sourceCardId: added.sourceCardId }]);
    expect(cards(cloned.id).find((c) => c.front === 'Kidney')).toMatchObject({ backImageUrl: urlOf('a2') });
    expect(db.media?.filter((m) => m.id === 'a2')).toHaveLength(1);
  });
});

describe('the origin hash includes the pictures', () => {
  const sha = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  it('is unchanged for a card with no picture, and moves with a picture or its description', () => {
    const base = { kind: 'basic', front: 'a', back: 'b' };
    expect(cardHash(base)).toBe(sha(['basic', 'a', 'b']));
    const withPic = { ...base, frontImageUrl: urlOf('x'), frontImageAlt: 'one' };
    expect(cardHash(withPic)).not.toBe(cardHash(base));
    expect(cardHash({ ...withPic, frontImageAlt: 'two' })).not.toBe(cardHash(withPic));
    expect(cardHash({ ...withPic, frontImageUrl: urlOf('y') })).not.toBe(cardHash(withPic));
  });
});

describe('an upsert by external id', () => {
  it('leaves a side it says nothing about, and replaces one it names', async () => {
    await upsertCardByExternalId('me', 'mine', 'k1', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const first = cards('mine')[0]!;
    const same = await upsertCardByExternalId('me', 'mine', 'k1', { front: 'Heart', back: 'Organ' });
    expect(same).toMatchObject({ ok: true, changed: false });
    expect(cards('mine')[0]!.frontImageUrl).toBe(first.frontImageUrl);
    const moved = await upsertCardByExternalId('me', 'mine', 'k1', {
      front: 'Heart',
      back: 'Organ',
      frontImage: pic('m2', 'New'),
    });
    expect(moved).toMatchObject({ ok: true, changed: true });
    expect(mediaIds()).not.toContain('m1');
  });
});

describe('the developer API', () => {
  it('sets a picture by media_id and returns it as frontImage', async () => {
    const res = await createMyCards('me', 'mine', [
      { front: 'Heart', back: 'Organ', frontImage: { media_id: 'm1', alt: 'A heart' } },
    ]);
    if (!res.ok) throw new Error('refused');
    expect(res.cards[0]).toMatchObject({
      front: 'Heart',
      frontImage: { url: urlOf('m1'), alt: 'A heart' },
      backImage: null,
    });
  });

  it('refuses a media_id that is another member’s or unknown, with invalid_media, and writes nothing', async () => {
    const before = db.writes;
    const foreign = await createMyCards('me', 'mine', [
      { front: 'a', back: 'b', frontImage: { media_id: 'a1', alt: 'x' } },
    ]);
    const unknown = await createMyCards('me', 'mine', [
      { front: 'a', back: 'b', backImage: { media_id: 'nope', alt: 'x' } },
    ]);
    expect(foreign).toMatchObject({ ok: false, code: 'invalid_media' });
    expect(unknown).toMatchObject({ ok: false, code: 'invalid_media' });
    expect(db.writes).toBe(before);
  });

  it('patches a picture on and off, and upserts with one', async () => {
    const made = await createMyCards('me', 'mine', [{ front: 'Heart', back: 'Organ' }]);
    if (!made.ok) throw new Error('refused');
    const id = made.cards[0]!.id;
    const patched = await patchMyCard('me', 'mine', id, { backImage: { media_id: 'm1', alt: 'A heart' } });
    expect(patched).toMatchObject({
      ok: true,
      card: { backImage: { url: urlOf('m1'), alt: 'A heart' }, frontImage: null },
    });
    const cleared = await patchMyCard('me', 'mine', id, { backImage: null });
    expect(cleared).toMatchObject({ ok: true, card: { backImage: null } });
    const upserted = await upsertMyCard('me', 'mine', 'k9', {
      front: 'Lung',
      back: 'Organ',
      frontImage: { media_id: 'm2', alt: 'A lung' },
    });
    expect(upserted).toMatchObject({ ok: true, created: true, card: { frontImage: { alt: 'A lung' } } });
  });
});

describe('upload and export', () => {
  it('uploads through the flashcard surface and records a pending row', async () => {
    ingestMock.mockResolvedValue({ url: urlOf('new'), width: 800, height: 600 });
    const file = new File([new Uint8Array([1, 2, 3])], 'heart.png', { type: 'image/png' });
    expect(await uploadCardImage('me', file)).toEqual({ ok: true, url: urlOf('new'), width: 800, height: 600 });
    expect(ingestMock).toHaveBeenCalledWith(file, 'flashcard', { userId: 'me', record: true });
    expect(await uploadCardImage('me', null)).toMatchObject({ ok: false, status: 400 });
  });

  it('turns an ingest refusal into its status', async () => {
    const { IngestError } = await import('@/lib/media/ingest.server');
    ingestMock.mockRejectedValue(new IngestError('Unsupported image format. Allowed: PNG, JPEG, WEBP.', 400));
    const file = new File([new Uint8Array([1])], 'x.gif', { type: 'image/gif' });
    expect(await uploadCardImage('me', file)).toMatchObject({ ok: false, status: 400 });
  });

  it('exports the member’s pictured cards with their descriptions', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    await addCard('me', 'mine', { front: 'Plain', back: 'Card' });
    const out = await exportCardImages('me');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ deck: 'Mine', front: 'Heart', frontImage: pic('m1'), backImage: null });
  });
});
