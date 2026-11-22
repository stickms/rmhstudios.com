/**
 * Sound on flashcards (s10-02), the server side, against the in-memory study database: the upload follows the media
 * policy (the bytes decide the type, the size is judged before the file is read, the daily allowance applies), a
 * sound needs its transcript, a cloze or occlusion front takes none, a sound must be the member's own fresh `PENDING`
 * upload of an audio type and is claimed once, the 200-card cap holds under its lock, and replacing or removing a
 * sound (or deleting its card or deck) deletes the object after the commit. A sound is played back to its recorder
 * only.
 */
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
const put = vi.hoisted(() => [] as { key: string; type: string; bytes: number }[]);
const deleted = vi.hoisted(() => [] as string[]);
const stored = vi.hoisted(() => ({}) as Record<string, Buffer>);

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/storage/s3.server', () => ({
  putObject: async (key: string, body: Buffer, type: string) => {
    put.push({ key, type, bytes: body.length });
    stored[key] = body;
  },
  deleteObject: async (key: string) => {
    deleted.push(key);
  },
  getObject: async (key: string) =>
    stored[key] ? { body: stored[key], contentType: 'application/octet-stream' } : null,
  getObjectRange: async () => null,
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return { prisma: { ...prisma, $queryRaw: vi.fn(async () => [] as unknown[]) } };
});

const { addCard, deleteCard, deleteDeck, updateCard } = await import('@/lib/study/deck-editor.server');
const { uploadCardSound, readCardSound, soundBodyTooLarge } = await import('@/lib/study/card-sound.server');
const { CARD_SOUND_MAX_BYTES, MAX_CARD_SOUNDS } = await import('@/lib/study/card-sound');
const { listMyCards } = await import('@/lib/api/v1/study.server');
const { exportCardSounds } = await import('@/lib/study/card-sound.server');

const WEBM = [0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const OGG = [0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const M4A = [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20];
const audio = (bytes: number[], name = 'a.webm', type = 'audio/webm') =>
  new File([new Uint8Array(bytes)], name, { type });

const nameOf = (id: string) => `me-${id}.webm`;
const urlOf = (id: string) => `/api/study/card-sound/${nameOf(id)}`;
const media = (id: string, userId = 'me', over: Record<string, unknown> = {}) => ({
  id,
  userId,
  key: `card-sound/${userId}-${id}.webm`,
  url: `/api/study/card-sound/${userId}-${id}.webm`,
  contentType: 'audio/webm',
  bytes: 4000,
  status: 'PENDING' as const,
  ...over,
});
const sound = (id: string, transcript = 'hola', userId = 'me') => ({
  url: `/api/study/card-sound/${userId}-${id}.webm`,
  transcript,
  durationMs: 1200,
});
const cards = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const mediaIds = () => (db.media ?? []).map((m) => m.id).sort();

beforeEach(() => {
  Object.assign(db, newFakeDb());
  put.length = 0;
  deleted.length = 0;
  for (const key of Object.keys(stored)) delete stored[key];
  db.decks = [
    { id: 'mine', userId: 'me', title: 'Mine', description: null, isPublic: false, cardCount: 0 },
    { id: 'theirs', userId: 'other', title: 'Theirs', description: null, isPublic: true, cardCount: 0 },
  ];
  db.media = [media('s1'), media('s2'), media('o1', 'other')];
});

describe('the upload follows the media policy', () => {
  it('refuses a renamed HTML file: the bytes decide the type, so nothing is stored', async () => {
    const html = new File(['<html><script>alert(1)</script></html>'], 'voice.webm', { type: 'audio/webm' });
    const res = await uploadCardSound('me', { audio: html, durationMs: 1000 });
    expect(res).toMatchObject({ ok: false, status: 415 });
    expect(put).toEqual([]);
    expect(db.media?.length).toBe(3);
  });

  it('refuses an SVG and a PNG the same way', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'a.ogg', { type: 'audio/ogg' });
    expect(await uploadCardSound('me', { audio: svg, durationMs: 1000 })).toMatchObject({ ok: false, status: 415 });
    const png = audio([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0], 'a.m4a', 'audio/mp4');
    expect(await uploadCardSound('me', { audio: png, durationMs: 1000 })).toMatchObject({ ok: false, status: 415 });
    expect(put).toEqual([]);
  });

  it('judges the size from the file before reading it, then again on the bytes', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const huge = { size: CARD_SOUND_MAX_BYTES + 1, type: 'audio/webm', arrayBuffer } as unknown as File;
    expect(await uploadCardSound('me', { audio: huge, durationMs: 1000 })).toMatchObject({ ok: false, status: 413 });
    expect(arrayBuffer).not.toHaveBeenCalled();
    // A client that lies about `size` is caught on the bytes.
    const lying = {
      size: 100,
      type: 'audio/webm',
      arrayBuffer: async () => new Uint8Array(CARD_SOUND_MAX_BYTES + 1).fill(0x1a).buffer,
    } as unknown as File;
    expect(await uploadCardSound('me', { audio: lying, durationMs: 1000 })).toMatchObject({ ok: false, status: 413 });
    expect(put).toEqual([]);
  });

  it('judges a declared body length before the multipart body is read', () => {
    expect(soundBodyTooLarge(CARD_SOUND_MAX_BYTES + 1024)).toBe(false);
    expect(soundBodyTooLarge(CARD_SOUND_MAX_BYTES + 128 * 1024)).toBe(true);
    expect(soundBodyTooLarge(Number.NaN)).toBe(false);
  });

  it('refuses a sound over 15 seconds, one of no length, and a missing file', async () => {
    expect(await uploadCardSound('me', { audio: audio(WEBM), durationMs: 15_001 })).toMatchObject({ status: 400 });
    expect(await uploadCardSound('me', { audio: audio(WEBM), durationMs: 0 })).toMatchObject({ status: 400 });
    expect(await uploadCardSound('me', { audio: audio(WEBM), durationMs: Number.NaN })).toMatchObject({ status: 400 });
    expect(await uploadCardSound('me', { audio: null, durationMs: 1000 })).toMatchObject({ status: 400 });
    expect(await uploadCardSound('me', { audio: audio(WEBM), durationMs: 15_000 })).toMatchObject({ ok: true });
  });

  it.each([
    ['webm', WEBM, 'audio/webm', 'webm'],
    ['ogg', OGG, 'audio/ogg', 'ogg'],
    ['mp4', M4A, 'audio/mp4', 'm4a'],
  ])('stores %s with the sniffed type and extension, and records a PENDING row', async (_n, bytes, type, ext) => {
    // The declared type is a lie on purpose: the bytes win.
    const res = await uploadCardSound('me', { audio: audio(bytes, 'x.bin', 'text/plain'), durationMs: 2500 });
    if (!res.ok) throw new Error(res.error);
    expect(put).toHaveLength(1);
    expect(put[0]!.type).toBe(type);
    expect(put[0]!.key).toMatch(new RegExp(`^card-sound/me-[A-Za-z0-9_-]+\\.${ext}$`));
    expect(res.url).toBe(`/api/study/card-sound/${put[0]!.key.slice('card-sound/'.length)}`);
    const row = db.media?.find((m) => m.url === res.url);
    expect(row).toMatchObject({ userId: 'me', status: 'PENDING', contentType: type, key: put[0]!.key });
  });

  it('applies the daily allowance when the caller knows the tier, on the same key as pictures', async () => {
    const limit = vi.fn(async () => ({ allowed: false, retryAfter: 60 }));
    const refused = await uploadCardSound('me', { audio: audio(WEBM), durationMs: 1000 }, { tier: 'pro', limit });
    expect(refused).toMatchObject({ ok: false, status: 429 });
    expect(limit).toHaveBeenCalledWith('media-quota:me', 1000, 24 * 60 * 60 * 1000);
    expect(put).toEqual([]);
    const allowed = vi.fn(async () => ({ allowed: true, retryAfter: 0 }));
    expect(
      await uploadCardSound('me', { audio: audio(WEBM), durationMs: 1000 }, { tier: 'pro', limit: allowed }),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('a sound needs its transcript and a side that takes one', () => {
  it('refuses a blank transcript and writes nothing', async () => {
    const before = db.writes;
    const res = await addCard('me', 'mine', { front: 'hello', back: 'hola', backSound: sound('s1', '   ') });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(db.writes).toBe(before);
    expect(db.media?.find((m) => m.id === 's1')?.status).toBe('PENDING');
  });

  it('refuses a front sound on a cloze card and on an occlusion card, and takes one on the back', async () => {
    const text = 'The {{c1::heart}} pumps blood.';
    expect(await addCard('me', 'mine', { kind: 'cloze', front: text, frontSound: sound('s1') })).toMatchObject({
      ok: false,
      status: 400,
    });
    const ok = await addCard('me', 'mine', { kind: 'cloze', front: text, backSound: sound('s1', 'the heart') });
    expect(ok).toMatchObject({ ok: true });
    expect(cards('mine')[0]).toMatchObject({
      backSoundUrl: urlOf('s1'),
      backSoundText: 'the heart',
      backSoundMs: 1200,
      frontSoundUrl: null,
    });
    // The generated cloze siblings carry no sound columns of their own.
    expect(db.cards.filter((c) => c.sourceId).every((c) => !c.backSoundUrl && !c.frontSoundUrl)).toBe(true);
  });

  it('refuses a switch to cloze while a front sound is on the card', async () => {
    await addCard('me', 'mine', { front: 'hello', back: 'hola', frontSound: sound('s1') });
    const id = cards('mine')[0]!.id;
    expect(await updateCard('me', id, { kind: 'cloze', front: 'The {{c1::heart}}' })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await updateCard('me', id, { kind: 'cloze', front: 'The {{c1::heart}}', frontSound: null })).toEqual({
      ok: true,
    });
  });

  it('refuses one object on both sides, and an address the upload never produced', async () => {
    const both = await addCard('me', 'mine', {
      front: 'a',
      back: 'b',
      frontSound: sound('s1'),
      backSound: sound('s1'),
    });
    expect(both).toMatchObject({ ok: false, status: 400 });
    const foreign = await addCard('me', 'mine', {
      front: 'a',
      back: 'b',
      backSound: { url: 'https://example.com/x.webm', transcript: 'x', durationMs: 1000 },
    });
    expect(foreign).toMatchObject({ ok: false, status: 400 });
  });
});

describe('a sound must be the member’s own fresh upload, claimed once', () => {
  it('claims the upload on save, by compare-and-set, under the member’s sound lock', async () => {
    const res = await addCard('me', 'mine', { front: 'hello', back: 'hola', backSound: sound('s1') });
    expect(res).toMatchObject({ ok: true });
    expect(db.media?.find((m) => m.id === 's1')?.status).toBe('ATTACHED');
    expect(db.locks).toContain('card-sounds:me');
    // The card the client gets back says what it saved, trimmed.
    expect((res as { card: { backSound: unknown } }).card.backSound).toEqual({ ...sound('s1'), transcript: 'hola' });
  });

  it('refuses another member’s upload, and writes nothing', async () => {
    const before = db.writes;
    const res = await addCard('me', 'mine', { front: 'hello', back: 'hola', backSound: sound('o1', 'hola', 'other') });
    expect(res).toMatchObject({ ok: false, status: 400, error: 'Upload the sound again' });
    expect(db.writes).toBe(before);
    expect(db.media?.find((m) => m.id === 'o1')?.status).toBe('PENDING');
    expect(cards('mine')).toHaveLength(0);
  });

  it('refuses a PENDING upload that is not audio', async () => {
    db.media!.push(media('img', 'me', { contentType: 'image/webp' }));
    const res = await addCard('me', 'mine', { front: 'a', back: 'b', backSound: sound('img') });
    expect(res).toMatchObject({ ok: false, status: 400, error: 'Upload the sound again' });
    expect(db.media?.find((m) => m.id === 'img')?.status).toBe('PENDING');
  });

  it('refuses an upload over the size cap and one that is a day old', async () => {
    db.media!.push(media('big', 'me', { bytes: CARD_SOUND_MAX_BYTES + 1 }));
    db.media!.push(media('old', 'me', { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }));
    for (const id of ['big', 'old']) {
      const res = await addCard('me', 'mine', { front: 'a', back: 'b', backSound: sound(id) });
      expect(res, id).toMatchObject({ ok: false, status: 400, error: 'Upload the sound again' });
    }
    expect(await addCard('me', 'mine', { front: 'a', back: 'b', backSound: sound('s2') })).toMatchObject({ ok: true });
  });

  it('claims an upload once: a second card cannot reuse an attached sound', async () => {
    expect(await addCard('me', 'mine', { front: 'a', back: 'b', backSound: sound('s1') })).toMatchObject({ ok: true });
    const again = await addCard('me', 'mine', { front: 'c', back: 'd', backSound: sound('s1') });
    expect(again).toMatchObject({ ok: false, status: 400, error: 'Upload the sound again' });
    expect(cards('mine')).toHaveLength(1);
  });

  it('refuses the 201st card with a sound, counted under the lock', async () => {
    db.cards = Array.from({ length: MAX_CARD_SOUNDS }, (_, i): FakeCard => ({
      id: `c${i}`,
      deckId: 'mine',
      front: `f${i}`,
      back: `b${i}`,
      position: i,
      backSoundUrl: `/api/study/card-sound/me-x${i}.webm`,
      backSoundText: 'x',
      backSoundMs: 1000,
    }));
    db.locks.length = 0;
    const res = await addCard('me', 'mine', { front: 'one more', back: 'x', backSound: sound('s1') });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(db.locks).toContain('card-sounds:me');
    expect(db.media?.find((m) => m.id === 's1')?.status).toBe('PENDING');
    // A card with no sound is not counted against the cap.
    expect(await addCard('me', 'mine', { front: 'plain', back: 'x' })).toMatchObject({ ok: true });
  });

  it('does not count a card that already carries a sound again when it is edited', async () => {
    db.cards = Array.from({ length: MAX_CARD_SOUNDS }, (_, i): FakeCard => ({
      id: `c${i}`,
      deckId: 'mine',
      front: `f${i}`,
      back: `b${i}`,
      position: i,
      backSoundUrl: i === 0 ? urlOf('s1') : `/api/study/card-sound/me-x${i}.webm`,
      backSoundText: 'x',
      backSoundMs: 1000,
    }));
    db.media![0]!.status = 'ATTACHED';
    expect(
      await updateCard('me', 'c0', { backSound: { url: urlOf('s1'), transcript: 'new words', durationMs: 1200 } }),
    ).toEqual({
      ok: true,
    });
    expect(db.cards.find((c) => c.id === 'c0')?.backSoundText).toBe('new words');
  });
});

describe('objects are deleted after the commit', () => {
  const withSound = async () => {
    await addCard('me', 'mine', { front: 'hello', back: 'hola', backSound: sound('s1') });
    return cards('mine')[0]!;
  };

  it('replacing a sound deletes the old object and its row, and claims the new one', async () => {
    const card = await withSound();
    expect(deleted).toEqual([]);
    expect(await updateCard('me', card.id, { backSound: sound('s2', 'adios') })).toEqual({ ok: true });
    expect(deleted).toEqual(['card-sound/me-s1.webm']);
    expect(mediaIds()).not.toContain('s1');
    expect(db.media?.find((m) => m.id === 's2')?.status).toBe('ATTACHED');
    expect(cards('mine')[0]).toMatchObject({ backSoundUrl: urlOf('s2'), backSoundText: 'adios' });
  });

  it('editing only the transcript keeps the object', async () => {
    const card = await withSound();
    expect(await updateCard('me', card.id, { backSound: { ...sound('s1'), transcript: 'hola!' } })).toEqual({
      ok: true,
    });
    expect(deleted).toEqual([]);
    expect(cards('mine')[0]!.backSoundText).toBe('hola!');
  });

  it('removing a sound deletes the object; leaving the field out keeps it', async () => {
    const card = await withSound();
    expect(await updateCard('me', card.id, { front: 'hello!' })).toEqual({ ok: true });
    expect(deleted).toEqual([]);
    expect(cards('mine')[0]!.backSoundUrl).toBe(urlOf('s1'));
    expect(await updateCard('me', card.id, { backSound: null })).toEqual({ ok: true });
    expect(deleted).toEqual(['card-sound/me-s1.webm']);
    expect(cards('mine')[0]).toMatchObject({ backSoundUrl: null, backSoundText: null, backSoundMs: null });
  });

  it('deleting the card, and deleting the deck, delete the objects', async () => {
    const card = await withSound();
    expect(await deleteCard('me', card.id)).toEqual({ ok: true });
    expect(deleted).toEqual(['card-sound/me-s1.webm']);
    expect(mediaIds()).not.toContain('s1');

    deleted.length = 0;
    await addCard('me', 'mine', { front: 'a', back: 'b', frontSound: sound('s2') });
    expect(await deleteDeck('me', 'mine')).toEqual({ ok: true });
    expect(deleted).toEqual(['card-sound/me-s2.webm']);
    expect(db.cards).toHaveLength(0);
  });

  it('keeps the object when the save is refused', async () => {
    const card = await withSound();
    const res = await updateCard('me', card.id, { backSound: sound('o1', 'x', 'other') });
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(deleted).toEqual([]);
    expect(cards('mine')[0]!.backSoundUrl).toBe(urlOf('s1'));
  });
});

describe('a sound is played back to its recorder only', () => {
  it('returns the bytes to the member who made it, typed from the stored extension', async () => {
    const up = await uploadCardSound('me', { audio: audio(OGG, 'a.ogg', 'audio/ogg'), durationMs: 1000 });
    if (!up.ok) throw new Error(up.error);
    const file = up.url.slice('/api/study/card-sound/'.length);
    const sound = await readCardSound('me', file);
    expect(sound?.contentType).toBe('audio/ogg');
    expect(sound?.body.length).toBe(OGG.length);
  });

  it('answers anyone else as if it did not exist', async () => {
    const up = await uploadCardSound('me', { audio: audio(WEBM), durationMs: 1000 });
    if (!up.ok) throw new Error(up.error);
    const file = up.url.slice('/api/study/card-sound/'.length);
    expect(await readCardSound('other', file)).toBeNull();
    expect(await readCardSound('me-extra', file)).toBeNull();
    expect(await readCardSound('', file)).toBeNull();
    expect(await readCardSound('me', '../../etc/passwd')).toBeNull();
    expect(await readCardSound('me', 'me-missing.webm')).toBeNull();
  });
});

describe('the developer API and the export', () => {
  it('GET /api/v1/me/decks/{id}/cards returns backSound with its transcript, and null for a side with none', async () => {
    await addCard('me', 'mine', { front: 'hello', back: 'hola', backSound: sound('s1', 'hola') });
    await addCard('me', 'mine', { front: 'plain', back: 'x' });
    const page = await listMyCards('me', 'mine', 20, undefined);
    if (page === null || page === 'invalid_cursor') throw new Error('no page');
    expect(page.data[0]).toMatchObject({
      frontSound: null,
      backSound: { url: urlOf('s1'), transcript: 'hola', durationMs: 1200 },
    });
    expect(page.data[1]).toMatchObject({ frontSound: null, backSound: null });
    // Another member's deck is not the key owner's: nothing is listed, so no sound can leave it.
    expect(await listMyCards('other', 'mine', 20, undefined)).toBeNull();
  });

  it('exports one row per sound: card id, side, URL, transcript and duration', async () => {
    await addCard('me', 'mine', {
      front: 'hello',
      back: 'hola',
      frontSound: sound('s1', 'hello'),
      backSound: sound('s2', 'hola'),
    });
    const rows = await exportCardSounds('me');
    expect(rows).toEqual([
      { deckId: 'mine', deck: 'Mine', cardId: cards('mine')[0]!.id, side: 'front', ...sound('s1', 'hello') },
      { deckId: 'mine', deck: 'Mine', cardId: cards('mine')[0]!.id, side: 'back', ...sound('s2', 'hola') },
    ]);
    expect(await exportCardSounds('other')).toEqual([]);
  });
});
