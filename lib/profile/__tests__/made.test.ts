import { beforeEach, describe, expect, it, vi } from 'vitest';

// "Made here" lists what a member has published. These hold the rules: nothing draft, hidden, private, locked,
// unlisted or on a taken-down song; a block either way, a tombstone, a banned or missing member refuse; the kinds
// filter; and four rows per kind. The fake database applies each query's `where`, so a row that should be left out
// is in the fixtures and the test fails if the query would return it.

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return value === cond;
    const c = cond as Row;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c) return value !== c.not;
    if ('gt' in c) return typeof value === 'number' && value > (c.gt as number);
    return matches((value ?? {}) as Row, c);
  });
}

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: {} as Record<string, number>,
  takes: {} as Record<string, number | undefined>,
}));

function table(name: string) {
  return {
    findMany: vi.fn(async (args: { where?: Row; take?: number; select?: Row }) => {
      db.calls[name] = (db.calls[name] ?? 0) + 1;
      db.takes[name] = args.take;
      const rows = (db.tables[name] ?? []).filter((r) => matches(r, args.where));
      return rows.slice(0, args.take ?? rows.length);
    }),
  };
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async (args: { where: { id: string } }) => db.tables.user?.find((u) => u.id === args.where.id) ?? null,
      ),
    },
    userBlock: {
      findFirst: vi.fn(async (args: { where: { OR: Row[] } }) => {
        return db.tables.userBlock?.find((b) => args.where.OR.some((c) => matches(b, c))) ?? null;
      }),
    },
    connectionsGrid: table('connectionsGrid'),
    lightsOutBoard: table('lightsOutBoard'),
    flashcardDeck: table('flashcardDeck'),
    chart: table('chart'),
    userBuild: table('userBuild'),
  },
}));

const { madeBy } = await import('@/lib/profile/made.server');
const { MADE_KINDS, MADE_PER_KIND, madeKindsParam, parseMadeKinds } = await import('@/lib/profile/made');
const { parseLayout } = await import('@/lib/profile/modules-schema');
const { MODULE_KINDS, PLUS_MODULE_KINDS, MODULE_LABELS } = await import('@/lib/profile/modules');

const ME = 'user-me';
const VISITOR = 'user-visitor';

function seed() {
  db.calls = {};
  db.takes = {};
  db.tables = {
    user: [
      { id: ME, banReason: null, bannedUntil: null, deletionScheduledAt: null },
      { id: VISITOR, banReason: null, bannedUntil: null, deletionScheduledAt: null },
      { id: 'gone', banReason: 'account_deleted', bannedUntil: new Date('9999-12-31'), deletionScheduledAt: null },
      { id: 'banned', banReason: 'spam', bannedUntil: new Date(Date.now() + 86_400_000), deletionScheduledAt: null },
      { id: 'leaving', banReason: null, bannedUntil: null, deletionScheduledAt: new Date() },
    ],
    userBlock: [],
    connectionsGrid: [
      { id: 'g-pub-1', authorId: ME, title: 'Birds', draft: false, hidden: false, playCount: 12 },
      { id: 'g-pub-2', authorId: ME, title: 'ماء', draft: false, hidden: false, playCount: 0 },
      { id: 'g-draft', authorId: ME, title: 'Unfinished', draft: true, hidden: false, playCount: 0 },
      { id: 'g-hidden', authorId: ME, title: 'Taken down', draft: false, hidden: true, playCount: 3 },
      { id: 'g-other', authorId: 'someone', title: 'Not mine', draft: false, hidden: false, playCount: 1 },
    ],
    lightsOutBoard: [
      { id: 'b-pub', authorId: ME, title: 'Cross', hidden: false, playCount: 7 },
      { id: 'b-hidden', authorId: ME, title: 'Hidden board', hidden: true, playCount: 7 },
    ],
    flashcardDeck: [
      { id: 'd-pub', userId: ME, title: 'Verbs', isPublic: true, moderatedAt: null, cardCount: 40 },
      { id: 'd-private', userId: ME, title: 'Private deck', isPublic: false, moderatedAt: null, cardCount: 10 },
      { id: 'd-locked', userId: ME, title: 'Locked deck', isPublic: true, moderatedAt: new Date(), cardCount: 10 },
      { id: 'd-empty', userId: ME, title: 'Empty deck', isPublic: true, moderatedAt: null, cardCount: 0 },
    ],
    chart: [
      {
        id: 'c-pub',
        authorId: ME,
        status: 'public',
        difficulty: 'hard',
        song: { title: 'Song A', isPublic: true, takenDownAt: null },
      },
      {
        id: 'c-ranked',
        authorId: ME,
        status: 'ranked',
        difficulty: 'expert',
        song: { title: 'Song B', isPublic: true, takenDownAt: null },
      },
      {
        id: 'c-draft',
        authorId: ME,
        status: 'draft',
        difficulty: 'easy',
        song: { title: 'Song C', isPublic: true, takenDownAt: null },
      },
      {
        id: 'c-private-song',
        authorId: ME,
        status: 'public',
        difficulty: 'easy',
        song: { title: 'Song D', isPublic: false, takenDownAt: null },
      },
      {
        id: 'c-down',
        authorId: ME,
        status: 'public',
        difficulty: 'easy',
        song: { title: 'Song E', isPublic: true, takenDownAt: new Date() },
      },
    ],
    userBuild: [
      {
        id: 'u-pub',
        userId: ME,
        slug: 'my-build',
        title: 'My build',
        visibility: 'PUBLIC',
        publishedAt: new Date(),
        _count: { versions: 3 },
      },
      {
        id: 'u-unlisted',
        userId: ME,
        slug: 'u',
        title: 'Unlisted',
        visibility: 'UNLISTED',
        publishedAt: new Date(),
        _count: { versions: 1 },
      },
      {
        id: 'u-private',
        userId: ME,
        slug: 'p',
        title: 'Private',
        visibility: 'PRIVATE',
        publishedAt: new Date(),
        _count: { versions: 1 },
      },
      {
        id: 'u-unpublished',
        userId: ME,
        slug: 'n',
        title: 'Never published',
        visibility: 'PUBLIC',
        publishedAt: null,
        _count: { versions: 0 },
      },
    ],
  };
}

const ids = (items: { id: string }[] | null) => (items ?? []).map((i) => i.id).sort();

describe('madeBy visibility', () => {
  beforeEach(seed);

  it('lists published grids, a board, a public deck, charts and a public build, linked, with one figure each', async () => {
    const items = (await madeBy(ME, VISITOR, MADE_KINDS)) ?? [];
    expect(ids(items)).toEqual(['b-pub', 'c-pub', 'c-ranked', 'd-pub', 'g-pub-1', 'g-pub-2', 'u-pub'].sort());
    const by = (id: string) => items.find((i) => i.id === id);
    expect(by('g-pub-1')).toEqual({
      kind: 'connections',
      id: 'g-pub-1',
      title: 'Birds',
      href: '/connections/u/g-pub-1',
      figure: { unit: 'plays', value: 12 },
    });
    expect(by('b-pub')).toMatchObject({ href: '/lights-out/b/b-pub', figure: { unit: 'plays', value: 7 } });
    expect(by('d-pub')).toMatchObject({ href: '/study/d-pub', figure: { unit: 'cards', value: 40 } });
    expect(by('c-pub')).toMatchObject({ title: 'Song A', figure: { unit: 'difficulty', value: 'hard' } });
    expect(by('c-pub')?.href).toBe('/slice-it?q=Song%20A');
    expect(by('u-pub')).toMatchObject({ href: '/builds/my-build', figure: { unit: 'releases', value: 3 } });
  });

  it('never lists a draft grid', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['connections']))).not.toContain('g-draft');
  });
  it('never lists a hidden grid or a hidden board', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['connections']))).not.toContain('g-hidden');
    expect(ids(await madeBy(ME, VISITOR, ['lights-out']))).toEqual(['b-pub']);
  });
  it('never lists a private deck, a moderator-locked deck or an empty deck', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['deck']))).toEqual(['d-pub']);
  });
  it('never lists a draft chart or a chart on a private or taken-down song; legacy ranked rows still count', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['chart']))).toEqual(['c-pub', 'c-ranked']);
  });
  it('never lists an UNLISTED, PRIVATE or unpublished build', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['build']))).toEqual(['u-pub']);
  });
  it('shows the owner the same list, never their drafts', async () => {
    const own = ids(await madeBy(ME, ME, MADE_KINDS));
    expect(own).toEqual(ids(await madeBy(ME, VISITOR, MADE_KINDS)));
  });
  it('lists nothing from another member', async () => {
    expect(ids(await madeBy(ME, VISITOR, ['connections']))).not.toContain('g-other');
  });
});

describe('madeBy refusals', () => {
  beforeEach(seed);

  it('refuses when the member blocked the viewer', async () => {
    db.tables.userBlock = [{ blockerId: ME, blockedId: VISITOR }];
    expect(await madeBy(ME, VISITOR, MADE_KINDS)).toBeNull();
  });
  it('refuses when the viewer blocked the member', async () => {
    db.tables.userBlock = [{ blockerId: VISITOR, blockedId: ME }];
    expect(await madeBy(ME, VISITOR, MADE_KINDS)).toBeNull();
  });
  it('does not run the five queries for a refused viewer', async () => {
    db.tables.userBlock = [{ blockerId: ME, blockedId: VISITOR }];
    await madeBy(ME, VISITOR, MADE_KINDS);
    expect(db.calls).toEqual({});
  });
  it('refuses a deleted member (the tombstone), for the owner too', async () => {
    expect(await madeBy('gone', VISITOR, MADE_KINDS)).toBeNull();
    expect(await madeBy('gone', 'gone', MADE_KINDS)).toBeNull();
  });
  it('refuses an unknown member, a banned member and one waiting to be deleted', async () => {
    expect(await madeBy('nobody', VISITOR, MADE_KINDS)).toBeNull();
    expect(await madeBy('banned', VISITOR, MADE_KINDS)).toBeNull();
    expect(await madeBy('leaving', VISITOR, MADE_KINDS)).toBeNull();
  });
  it('answers a signed-out visitor', async () => {
    expect((await madeBy(ME, null, ['deck']))?.length).toBe(1);
  });
});

describe('madeBy kinds and the cap', () => {
  beforeEach(seed);

  it('queries only the kinds asked for', async () => {
    const items = await madeBy(ME, VISITOR, ['deck', 'build']);
    expect(ids(items)).toEqual(['d-pub', 'u-pub']);
    expect(Object.keys(db.calls).sort()).toEqual(['flashcardDeck', 'userBuild']);
  });
  it('answers an empty list, with no query, when no kind is asked for', async () => {
    expect(await madeBy(ME, VISITOR, [])).toEqual([]);
    expect(db.calls).toEqual({});
  });
  it('asks for at most four rows of each kind, one query each', async () => {
    expect(MADE_PER_KIND).toBe(4);
    await madeBy(ME, VISITOR, MADE_KINDS);
    expect(db.takes).toEqual({
      connectionsGrid: 4,
      lightsOutBoard: 4,
      flashcardDeck: 4,
      chart: 4,
      userBuild: 4,
    });
    expect(Object.values(db.calls).every((n) => n === 1)).toBe(true);
  });
  it('returns four grids at most when a member has six', async () => {
    db.tables.connectionsGrid = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`,
      authorId: ME,
      title: `G${i}`,
      draft: false,
      hidden: false,
      playCount: i,
    }));
    expect(((await madeBy(ME, VISITOR, ['connections'])) ?? []).length).toBe(4);
  });
});

describe('the kinds list', () => {
  it('parses a comma-separated list, drops unknown names and keeps the canonical order', () => {
    expect(parseMadeKinds(undefined)).toEqual([...MADE_KINDS]);
    expect(parseMadeKinds('')).toEqual([]);
    expect(parseMadeKinds('build,deck,nonsense,deck')).toEqual(['deck', 'build']);
  });
  it('writes the parameter, omitting it when every kind is ticked', () => {
    expect(madeKindsParam(MADE_KINDS)).toBeUndefined();
    expect(madeKindsParam(['build', 'connections'])).toBe('connections,build');
    expect(madeKindsParam([])).toBe('');
  });
});

describe('the module in the layout', () => {
  it('is a plus module with a label, and defaults to every kind', () => {
    expect(MODULE_KINDS).toContain('made');
    expect(PLUS_MODULE_KINDS).toContain('made');
    expect(MODULE_LABELS.made).toBe('Made here');
    expect(parseLayout([{ kind: 'made' }])).toEqual([{ kind: 'made', config: { kinds: [...MADE_KINDS] } }]);
  });
  it('keeps the kinds the member left ticked and drops an unknown one', () => {
    expect(parseLayout([{ kind: 'made', config: { kinds: ['deck', 'build'] } }])).toEqual([
      { kind: 'made', config: { kinds: ['deck', 'build'] } },
    ]);
    expect(parseLayout([{ kind: 'made', config: { kinds: ['deck', 'nonsense'] } }])).toEqual([]);
  });
});
