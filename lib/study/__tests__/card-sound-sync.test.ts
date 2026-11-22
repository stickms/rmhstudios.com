/**
 * A sound is private to its recorder (s10-02): copying a public deck and applying the author's updates carry no
 * sound (and never touch a sound the copier recorded), a sound change is not a deck update, and every payload
 * another member receives (the deck page, a practice test) leaves the sound fields out. A source scan holds the
 * list of server files that read the sound columns (`CARD_SOUND_READ_PATHS`), so a new reader cannot leak one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from './fake-study-db';

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

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/storage/s3.server', () => ({
  putObject: async () => {},
  deleteObject: async (key: string) => {
    deleted.push(key);
  },
  getObject: async () => null,
  getObjectRange: async () => null,
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return { prisma: { ...prisma, $queryRaw: vi.fn(async () => [] as unknown[]) } };
});

const { addCard, updateCard } = await import('@/lib/study/deck-editor.server');
const { cloneDeck, getDeck, getTestCards } = await import('@/lib/study.server');
const { applyUpdates, deckUpdates } = await import('@/lib/study/deck-sync.server');
const { cardHash } = await import('@/lib/study/deck-sync');
const { CARD_SOUND_OWNER_ONLY_PATHS, CARD_SOUND_READ_PATHS } = await import('@/lib/study/card-sound');

const sound = (userId: string, id: string, transcript = 'hola') => ({
  url: `/api/study/card-sound/${userId}-${id}.webm`,
  transcript,
  durationMs: 1500,
});
const media = (userId: string, id: string) => ({
  id: `${userId}-${id}`,
  userId,
  key: `card-sound/${userId}-${id}.webm`,
  url: `/api/study/card-sound/${userId}-${id}.webm`,
  contentType: 'audio/webm',
  bytes: 3000,
  status: 'PENDING' as const,
});
const cards = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const SOUND_KEYS = [
  'frontSoundUrl',
  'frontSoundText',
  'frontSoundMs',
  'backSoundUrl',
  'backSoundText',
  'backSoundMs',
] as const;

beforeEach(async () => {
  Object.assign(db, newFakeDb());
  deleted.length = 0;
  db.decks = [
    { id: 'pub', userId: 'author', title: 'Pub', description: null, isPublic: true, cardCount: 0 },
    { id: 'priv', userId: 'author', title: 'Priv', description: null, isPublic: false, cardCount: 0 },
  ];
  db.media = [media('author', 'a1'), media('author', 'a2'), media('me', 'm1')];
  // The author's public deck: one card with a sound on each side.
  const made = await addCard('author', 'pub', {
    front: 'hello',
    back: 'hola',
    frontSound: sound('author', 'a1', 'hello'),
    backSound: sound('author', 'a2', 'hola'),
  });
  if (!made.ok) throw new Error(made.error);
});

describe('copying a deck leaves the sounds behind', () => {
  it('the copy’s card has none, and the author’s objects are untouched', async () => {
    expect(cards('pub')[0]).toMatchObject({ backSoundUrl: sound('author', 'a2').url });
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const copy = cards(cloned.id);
    expect(copy).toHaveLength(1);
    for (const key of SOUND_KEYS) expect(copy[0]![key] ?? null, key).toBeNull();
    expect(deleted).toEqual([]);
    expect(
      db.media
        ?.filter((m) => m.status === 'ATTACHED')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['author-a1', 'author-a2']);
  });

  it('the copy’s origin hash does not move with a sound', () => {
    const base = { kind: 'basic', front: 'hello', back: 'hola' };
    const withSound = { ...base, backSoundUrl: sound('author', 'a2').url, backSoundText: 'hola', backSoundMs: 1500 };
    expect(cardHash(withSound)).toBe(cardHash(base));
  });
});

describe('applying the author’s updates carries no sound', () => {
  it('a text change reaches the copier without the author’s sound, and a sound-only change is no update', async () => {
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const source = cards('pub')[0]!;

    // The author replaces a sound only: nothing for the copier to apply.
    expect(await updateCard('author', source.id, { backSound: sound('author', 'a1', 'new') })).toMatchObject({
      ok: false,
    });
    db.media!.push(media('author', 'a3'));
    expect(await updateCard('author', source.id, { backSound: sound('author', 'a3', 'adios') })).toEqual({ ok: true });
    const none = await deckUpdates('me', cloned.id);
    if (!none.ok) throw new Error('no detail');
    expect(none.diff.changed).toHaveLength(0);

    // The author changes the text: the copier is offered it and gets the text only.
    await updateCard('author', source.id, { back: 'hola!' });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    expect(detail.diff.changed).toHaveLength(1);
    const item = detail.diff.changed[0]!;
    expect(JSON.stringify(item)).not.toContain('card-sound');
    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 1 });
    const copyCard = cards(cloned.id)[0]!;
    expect(copyCard.back).toBe('hola!');
    for (const key of SOUND_KEYS) expect(copyCard[key] ?? null, key).toBeNull();
  });

  it('a new card with a sound reaches the copier without it', async () => {
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    db.media!.push(media('author', 'a3'));
    await addCard('author', 'pub', { front: 'bye', back: 'adios', backSound: sound('author', 'a3', 'adios') });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    const added = detail.diff.added.find((a) => a.card.front === 'bye')!;
    await applyUpdates('me', cloned.id, [{ type: 'new', sourceCardId: added.sourceCardId }]);
    const copy = cards(cloned.id).find((c) => c.front === 'bye')!;
    for (const key of SOUND_KEYS) expect(copy[key] ?? null, key).toBeNull();
  });

  it('a sound the copier recorded on their own copy survives an update, and its object is kept', async () => {
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const mine = cards(cloned.id)[0]!;
    expect(await updateCard('me', mine.id, { backSound: sound('me', 'm1', 'mine') })).toEqual({ ok: true });
    await updateCard('author', cards('pub')[0]!.id, { back: 'hola!' });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    const item = detail.diff.changed[0]!;
    await applyUpdates('me', cloned.id, [{ type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash }]);
    expect(cards(cloned.id)[0]).toMatchObject({
      back: 'hola!',
      backSoundUrl: sound('me', 'm1').url,
      backSoundText: 'mine',
    });
    expect(deleted).toEqual([]);
  });
});

describe('what another member receives carries no sound', () => {
  it('the deck page sends the sound fields to the owner only', async () => {
    const owner = await getDeck('pub', { id: 'author' });
    expect(owner?.cards[0]).toMatchObject({
      frontSound: sound('author', 'a1', 'hello'),
      backSound: sound('author', 'a2', 'hola'),
    });
    for (const viewer of [{ id: 'me' }, { id: null }]) {
      const detail = await getDeck('pub', viewer);
      expect(detail?.cards).toHaveLength(1);
      const card = detail!.cards[0]!;
      expect('frontSound' in card).toBe(false);
      expect('backSound' in card).toBe(false);
      expect(JSON.stringify(detail)).not.toContain('card-sound');
    }
  });

  it('a practice test sends them to the owner only, and to a caller that names no viewer, to nobody', async () => {
    expect((await getTestCards('pub', 'author'))[0]).toMatchObject({ backSound: sound('author', 'a2') });
    for (const viewer of ['me', null, undefined]) {
      const rows = await getTestCards('pub', viewer as string | null);
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain('card-sound');
    }
  });
});

/** Every `.ts` and `.tsx` file the app ships, as repository-relative paths (tests and generated files excluded). */
function sourceFiles(): string[] {
  const root = join(__dirname, '..', '..', '..');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (
        ['node_modules', '.git', '__tests__', 'generated', 'dist', '.output', '.cache', 'locales', 'docs'].includes(
          name,
        )
      )
        continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.gen.ts')) {
        out.push(relative(root, path));
      }
    }
  };
  for (const dir of ['lib', 'app', 'components', 'features', 'server']) walk(join(root, dir));
  return out;
}

describe('CARD_SOUND_READ_PATHS', () => {
  const root = join(__dirname, '..', '..', '..');
  const read = (file: string) => readFileSync(join(root, file), 'utf8');
  const touchesColumns = (src: string) => /\b(frontSoundUrl|backSoundUrl|CARD_SOUND_SELECT)\b/.test(src);

  it('lists every server file that selects the sound columns, and nothing reads them unlisted', () => {
    const listed = new Set<string>([...CARD_SOUND_READ_PATHS, ...CARD_SOUND_OWNER_ONLY_PATHS]);
    const readers = sourceFiles().filter((file) => touchesColumns(read(file)));
    const unlisted = readers.filter((file) => !listed.has(file));
    expect(
      unlisted,
      `these files name a sound column but are not in CARD_SOUND_READ_PATHS: ${unlisted.join(', ')}`,
    ).toEqual([]);
    for (const file of listed) expect(sourceFiles(), `${file} is listed but does not exist`).toContain(file);
  });

  it('every reader sends the sounds through `soundFields` (the owner check), or to the key owner’s own cards', () => {
    for (const file of CARD_SOUND_READ_PATHS) {
      const src = read(file);
      if (file === 'lib/api/v1/study.server.ts') {
        // Every card this reads is in a deck the key owner owns; it never lists another member's cards.
        expect(src).toMatch(/fromSoundColumns\(row\)/);
        expect(src).toMatch(/Every card this reads is in a deck the key owner owns/);
      } else {
        expect(src, file).toMatch(/soundFields\(/);
      }
    }
  });

  it('the copy, sync and clone code never name a sound column', () => {
    for (const file of ['lib/study/deck-sync.server.ts', 'lib/study/deck-sync.ts']) {
      expect(read(file), file).not.toMatch(/Sound/);
    }
    // The clone's explicit select takes pictures and the card's text, no sound.
    const study = read('lib/study.server.ts');
    const clone = study.slice(study.indexOf('export async function cloneDeck'), study.indexOf('const cardKind'));
    expect(clone).not.toMatch(/Sound/);
  });

  it('the queue only builds sounds for cards in the viewer’s own decks', () => {
    const queue = read('lib/study/queue.server.ts');
    expect(queue).toMatch(/soundFields\(soundsOfRow\(c, c\.source\), c\.deck\.userId === viewerId\)/);
    const review = read('lib/study/api/study.decks.$id.review.server.ts');
    expect(review).toMatch(/soundFields\(soundsOfRow\(c, c\.source\), deck\.userId === userId\)/);
  });

  it('review shows the transcript only once the answer is revealed', () => {
    const src = read('components/study/ReviewAll.tsx');
    // Whitespace-tolerant: prettier may break the props across lines.
    expect(src).toMatch(/<CardSound\s+sound=\{card\.frontSound\}\s+side="front"\s+showTranscript=\{revealed\}/);
  });
});
