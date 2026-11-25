/**
 * `GET /api/v1/me/characters`, `/me/characters/{id}`, `/me/parties` and `/me/parties/{id}` (s12-13), driven through the
 * real developer-API wrapper, the real party module and the real rules engines on a stand-in Prisma: the
 * `read:characters` scope is required, another member's character and a party the owner is not in (or left) are
 * `not_found`, the party view never carries a sheet, `notes` or the invite code, the portrait image is removed from a
 * sheet, summaries equal the site's `partySummary`, pages and cursors, and every response is `private, no-store`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

/** Loose on purpose: the stand-in Prisma and the JSON bodies are read field by field. */
type Row = Record<string, ReturnType<typeof JSON.parse>>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  keyN: 0,
  characters: [] as Row[],
  parties: [] as Row[],
  members: [] as Row[],
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'me',
    tier: 'enterprise',
    keyId: `key_${h.keyN}`,
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const calls = vi.hoisted(() => ({ characterWheres: [] as Row[] }));

/** Parties the user may read: runs it, or has a membership row. */
const visible = (p: Row, userId: string) =>
  p.ownerId === userId || h.members.some((m) => m.partyId === p.id && m.userId === userId);
const chip = (id: string) => ({ id, name: `Name ${id}`, handle: id, image: null });

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rmhCharacter: {
      findMany: vi.fn(async (a: { where: Row; take?: number }) => {
        calls.characterWheres.push(a.where);
        let rows = h.characters.slice();
        if (a.where.id?.in) rows = rows.filter((r) => a.where.id.in.includes(r.id));
        if (a.where.userId) rows = rows.filter((r) => r.userId === a.where.userId);
        const or = a.where.OR as Row[] | undefined;
        if (or) {
          const [before, tie] = or as [{ updatedAt: { lt: Date } }, { updatedAt: Date; id: { lt: string } }];
          rows = rows.filter(
            (r) =>
              r.updatedAt.getTime() < before.updatedAt.lt.getTime() ||
              (r.updatedAt.getTime() === tie.updatedAt.getTime() && r.id < tie.id.lt),
          );
        }
        rows.sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime() || (x.id < y.id ? 1 : -1));
        return rows.slice(0, a.take ?? rows.length);
      }),
      findFirst: vi.fn(async (a: { where: { id: string; userId: string } }) => {
        calls.characterWheres.push(a.where);
        return h.characters.find((r) => r.id === a.where.id && r.userId === a.where.userId) ?? null;
      }),
    },
    rmhCharacterParty: {
      findMany: vi.fn(
        async (a: { where: { OR: [{ ownerId: string }, { members: { some: { userId: string } } }] } }) => {
          const userId = a.where.OR[0].ownerId;
          return h.parties
            .filter((p) => visible(p, userId))
            .map((p) => ({
              id: p.id,
              name: p.name,
              system: p.system,
              ownerId: p.ownerId,
              owner: chip(p.ownerId),
              _count: { members: h.members.filter((m) => m.partyId === p.id).length },
            }));
        },
      ),
      findFirst: vi.fn(async (a: { where: { id: string; OR: [{ ownerId: string }] } }) => {
        const userId = a.where.OR[0].ownerId;
        const p = h.parties.find((x) => x.id === a.where.id && visible(x, userId));
        if (!p) return null;
        return {
          ...p,
          owner: chip(p.ownerId),
          members: h.members
            .filter((m) => m.partyId === p.id)
            .map((m) => ({ ...m, sheetShared: true, joinedAt: new Date(1_700_000_000_000), user: chip(m.userId) })),
        };
      }),
    },
  },
}));

const list = await import('@/app/routes/api/v1/me/characters');
const one = await import('@/app/routes/api/v1/me/characters/$id');
const parties = await import('@/app/routes/api/v1/me/parties');
const party = await import('@/app/routes/api/v1/me/parties/$id');
const { newDnd5e, newPf2e, normalizeCharacter } = await import('@features/rmhcharacters/engine/factory');
const { partySummary } = await import('@features/rmhcharacters/engine/party-summary');
const { loadDnd5e, loadPf2e } = await import('@features/rmhcharacters/engine/data');
const { encodeCharacterCursor, decodeCharacterCursor, charactersQuery } =
  await import('@/lib/api/v1/characters-schema');

const LIST = handlersOf<TestHandler>(list.Route).GET!;
const ONE = handlersOf<TestHandler>(one.Route).GET!;
const PARTIES = handlersOf<TestHandler>(parties.Route).GET!;
const PARTY = handlersOf<TestHandler>(party.Route).GET!;

const base = 'https://rmhstudios.com/api/v1/me';
const getList = (query = '') => LIST({ request: new Request(`${base}/characters${query}`), params: {} });
const getOne = (id: string) => ONE({ request: new Request(`${base}/characters/${id}`), params: { id } });
const getParties = () => PARTIES({ request: new Request(`${base}/parties`), params: {} });
const getParty = (id: string) => PARTY({ request: new Request(`${base}/parties/${id}`), params: { id } });

const sheet = (over: Row) => ({ ...newDnd5e(), ...over });
const row = (userId: string, c: Row, updatedAt: number): Row => ({
  id: c.id,
  userId,
  data: c,
  updatedAt: new Date(updatedAt),
});
const T0 = 1_700_000_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  calls.characterWheres = [];
  h.keyN++;
  h.scopes = ['read:characters'];
  h.characters = [
    row(
      'me',
      sheet({ id: 'c-mine-1', name: 'Brienne', portrait: 'data:image/png;base64,AAAA', notes: 'my secret' }),
      T0 + 2000,
    ),
    row('me', { ...newPf2e(), id: 'c-mine-2', name: 'Tomas' }, T0 + 1000),
    row('other', sheet({ id: 'c-theirs', name: 'Zed', notes: 'their notes' }), T0 + 3000),
    row('p2', sheet({ id: 'c-p2', name: 'Pip', notes: 'pip notes', portrait: 'data:image/png;base64,BBBB' }), T0),
  ];
  h.parties = [
    {
      id: 'pa',
      name: 'Thursday table',
      system: 'dnd5e',
      ownerId: 'gm1',
      inviteCode: 'invite-code-1',
      initiative: [],
      turnIndex: 0,
      orderVersion: 3,
    },
    {
      id: 'pb',
      name: 'My own game',
      system: 'dnd5e',
      ownerId: 'me',
      inviteCode: 'invite-code-2',
      initiative: [],
      turnIndex: 0,
      orderVersion: 0,
    },
    {
      id: 'pc',
      name: 'Not mine',
      system: 'dnd5e',
      ownerId: 'gm2',
      inviteCode: 'invite-code-3',
      initiative: [],
      turnIndex: 0,
      orderVersion: 0,
    },
  ];
  h.members = [
    { partyId: 'pa', userId: 'me', characterId: 'c-mine-1' },
    { partyId: 'pa', userId: 'p2', characterId: 'c-p2' },
    { partyId: 'pc', userId: 'other', characterId: 'c-theirs' },
  ];
});

describe('the scope', () => {
  const calls_: [string, () => Promise<Response>][] = [
    ['list', () => getList()],
    ['one', () => getOne('c-mine-1')],
    ['parties', () => getParties()],
    ['party', () => getParty('pa')],
  ];

  it.each(calls_)('%s is refused without read:characters', async (_n, call) => {
    h.scopes = ['read:study', 'write:*'];
    const res = await call();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('insufficient_scope');
  });

  it.each(calls_)('%s accepts read:characters, read:* and *', async (_n, call) => {
    for (const scopes of [['read:characters'], ['read:*'], ['*']]) {
      h.scopes = scopes;
      expect((await call()).status).toBe(200);
    }
  });

  it('is an ordinary read scope in its own group', async () => {
    const { SCOPES, WILDCARD_SCOPES } = await import('@/lib/api/scopes');
    const s = SCOPES.find((x) => x.id === 'read:characters');
    expect(s).toMatchObject({ action: 'read', group: 'RMHCharacters' });
    expect(s?.explicit).toBeUndefined();
    expect(WILDCARD_SCOPES).toContain('read:characters');
  });
});

describe('GET /me/characters', () => {
  it("lists only the key owner's characters, newest edit first, with the site's summary", async () => {
    const res = await getList();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Row[]; nextCursor: string | null };
    expect(body.data.map((c) => c.id)).toEqual(['c-mine-1', 'c-mine-2']);
    expect(body.nextCursor).toBeNull();
    const first = body.data[0]!;
    expect(first).toMatchObject({ system: 'dnd5e', name: 'Brienne', updatedAt: new Date(T0 + 2000).toISOString() });
    expect(first.summary.ac).toBeTypeOf('number');
    expect(first.summary.hp).toMatchObject({ max: expect.any(Number) });
    expect(first).not.toHaveProperty('sheet');
    expect(JSON.stringify(body)).not.toContain('my secret');
    expect(JSON.stringify(body)).not.toContain('base64');
  });

  it('computes the summary with the same function the site uses (5e and PF2e)', async () => {
    const body = (await (await getList()).json()) as { data: Row[] };
    const [a, b] = body.data;
    const c1 = normalizeCharacter(h.characters[0]!.data)!;
    const c2 = normalizeCharacter(h.characters[1]!.data)!;
    expect(a!.summary).toEqual(partySummary(c1 as never, await loadDnd5e()));
    expect(b!.summary).toEqual(partySummary(c2 as never, await loadPf2e()));
    expect(a!.level).toBe(a!.summary.level);
  });

  it('pages with a cursor and never repeats a row', async () => {
    const p1 = (await (await getList('?limit=1')).json()) as { data: Row[]; nextCursor: string | null };
    expect(p1.data.map((c) => c.id)).toEqual(['c-mine-1']);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await (await getList(`?limit=1&cursor=${p1.nextCursor}`)).json()) as typeof p1;
    expect(p2.data.map((c) => c.id)).toEqual(['c-mine-2']);
    expect(p2.nextCursor).toBeNull();
  });

  it('breaks a tie on the same instant by id', async () => {
    h.characters = [
      row('me', sheet({ id: 'a', name: 'A' }), T0),
      row('me', sheet({ id: 'b', name: 'B' }), T0),
      row('me', sheet({ id: 'c', name: 'C' }), T0),
    ];
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const res = await getList(`?limit=1${cursor ? `&cursor=${cursor}` : ''}`);
      const body = (await res.json()) as { data: Row[]; nextCursor: string | null };
      seen.push(...body.data.map((c) => c.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(['c', 'b', 'a']);
  });

  it('refuses a bad cursor, a bad limit and a garbage query with 400', async () => {
    expect((await getList('?cursor=!!!')).status).toBe(400);
    expect((await getList('?limit=0')).status).toBe(400);
    expect((await getList('?limit=51')).status).toBe(400);
    expect((await getList('?limit=abc')).status).toBe(400);
  });

  it('leaves out a sheet the rules can no longer read, and answers an empty account with an empty page', async () => {
    h.characters = [row('me', { system: 'nope' }, T0)];
    const body = (await (await getList()).json()) as { data: Row[]; nextCursor: string | null };
    expect(body).toEqual({ data: [], nextCursor: null });
  });

  it('always filters by the key owner', async () => {
    await getList();
    expect(calls.characterWheres[0]).toMatchObject({ userId: 'me' });
  });

  it('round-trips the cursor encoding and rejects malformed ones', () => {
    const c = { ms: T0, id: 'abc|def' };
    expect(decodeCharacterCursor(encodeCharacterCursor(c))).toEqual(c);
    expect(decodeCharacterCursor('')).toBeNull();
    expect(decodeCharacterCursor(encodeCharacterCursor({ ms: Number.NaN, id: 'x' }))).toBeNull();
    expect(charactersQuery.parse({})).toEqual({ limit: 25 });
  });
});

describe('GET /me/characters/{id}', () => {
  it('returns the stored sheet without the portrait image and says there was one', async () => {
    const res = await getOne('c-mine-1');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Row };
    expect(data).toMatchObject({ id: 'c-mine-1', name: 'Brienne', system: 'dnd5e', portrait: true });
    expect(data.sheet).not.toHaveProperty('portrait');
    expect(JSON.stringify(data)).not.toContain('base64');
    expect(data.sheet.notes).toBe('my secret'); // the owner's own sheet keeps its notes
    expect(data.sheet.baseAbilities).toBeTruthy();
    expect(data.summary.name).toBe('Brienne');
  });

  it('says portrait false when the sheet has none', async () => {
    const { data } = (await (await getOne('c-mine-2')).json()) as { data: Row };
    expect(data.portrait).toBe(false);
    expect(data.sheet).not.toHaveProperty('portrait');
  });

  it("is not_found for another member's character, for an unknown id and for a party member's sheet", async () => {
    for (const id of ['c-theirs', 'c-p2', 'nope']) {
      const res = await getOne(id);
      expect(res.status, id).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found');
    }
  });

  it('scopes the read to the key owner in the query itself', async () => {
    await getOne('c-theirs');
    expect(calls.characterWheres[0]).toEqual({ id: 'c-theirs', userId: 'me' });
  });
});

describe('GET /me/parties', () => {
  it('lists the parties the owner runs or plays in, with role and member count, and no others', async () => {
    const { data } = (await (await getParties()).json()) as { data: Row[] };
    expect(data.map((p) => p.id).sort()).toEqual(['pa', 'pb']);
    expect(data.find((p) => p.id === 'pa')).toEqual({
      id: 'pa',
      name: 'Thursday table',
      system: 'dnd5e',
      role: 'player',
      gm: 'Name gm1',
      members: 2,
    });
    expect(data.find((p) => p.id === 'pb')).toMatchObject({ role: 'gm', members: 0 });
    expect(JSON.stringify(data)).not.toContain('invite-code');
  });
});

describe('GET /me/parties/{id}', () => {
  it("shows each member's summary and the turn order, and never a sheet, notes, portrait or the invite code", async () => {
    h.parties[0]!.initiative = [
      { id: 'l1', kind: 'member', userId: 'p2', value: 18 },
      { id: 'l2', kind: 'extra', name: 'Goblin', value: 9 },
    ];
    h.parties[0]!.turnIndex = 1;
    const res = await getParty('pa');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Row };
    expect(data).toMatchObject({ id: 'pa', role: 'player', turnIndex: 1, gm: 'Name gm1' });
    expect(data.members).toHaveLength(2);
    const pip = data.members.find((m: Row) => m.userId === 'p2');
    expect(pip.summary).toEqual(partySummary(normalizeCharacter(h.characters[3]!.data) as never, await loadDnd5e()));
    expect(data.order).toEqual([
      { id: 'l1', kind: 'member', userId: 'p2', name: 'Name p2', value: 18 },
      { id: 'l2', kind: 'extra', userId: null, name: 'Goblin', value: 9 },
    ]);
    const text = JSON.stringify(data);
    for (const leak of ['pip notes', 'my secret', 'base64', 'invite-code', 'orderVersion'])
      expect(text).not.toContain(leak);
    for (const m of data.members) {
      expect(m).not.toHaveProperty('sheet');
      expect(m).not.toHaveProperty('notes');
      expect(Object.keys(m).sort()).toEqual(['isGm', 'joinedAt', 'name', 'summary', 'userId']);
    }
  });

  it('is not_found for a party the owner is not in, and for one they left', async () => {
    expect((await getParty('pc')).status).toBe(404);
    expect((await getParty('nope')).status).toBe(404);
    expect((await getParty('pa')).status).toBe(200);
    h.members = h.members.filter((m) => !(m.partyId === 'pa' && m.userId === 'me'));
    const gone = await getParty('pa');
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as { error: { code: string } }).error.code).toBe('not_found');
    expect(((await (await getParties()).json()) as { data: Row[] }).data.map((p) => p.id)).toEqual(['pb']);
  });

  it('gives a null summary for a member whose sheet cannot be read, not an error', async () => {
    h.characters = h.characters.filter((c) => c.id !== 'c-p2');
    const { data } = (await (await getParty('pa')).json()) as { data: Row };
    expect(data.members.find((m: Row) => m.userId === 'p2').summary).toBeNull();
  });
});

describe('caching', () => {
  it('every response, success or refusal, is private and no-store', async () => {
    const all = [
      getList(),
      getList('?limit=0'),
      getOne('c-mine-1'),
      getOne('c-theirs'),
      getParties(),
      getParty('pa'),
      getParty('pc'),
    ];
    for (const res of await Promise.all(all)) expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('wiring', () => {
  const root = join(__dirname, '..', '..', '..', '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('the four routes all require read:characters', () => {
    for (const f of ['characters.ts', 'characters/$id.ts', 'parties.ts', 'parties/$id.ts']) {
      expect(read(`app/routes/api/v1/me/${f}`), f).toContain("scope: 'read:characters'");
    }
  });

  it('builds on the engine functions and keeps no second summary or sheet reader', () => {
    const src = read('lib/api/v1/characters.server.ts');
    expect(src).toContain('partySummary');
    expect(src).toContain('getParty');
    expect(src).toContain('listParties');
    expect(src).not.toMatch(/rmhCharacterPartyMember|\$queryRaw|\$executeRaw/);
  });

  it('documents the four endpoints under the scope', async () => {
    const { ENDPOINTS } = await import('@/lib/api/registry');
    const mine = ENDPOINTS.filter((e) => e.group === 'RMHCharacters');
    expect(mine.map((e) => e.path).sort()).toEqual([
      '/api/v1/me/characters',
      '/api/v1/me/characters/{id}',
      '/api/v1/me/parties',
      '/api/v1/me/parties/{id}',
    ]);
    for (const e of mine) expect(e.scope).toBe('read:characters');
  });
});
