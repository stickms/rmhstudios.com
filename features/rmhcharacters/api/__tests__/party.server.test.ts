/**
 * Parties hold the privacy boundary of RMHCharacters: a non-member gets 404 for every read, the summary carries no raw
 * sheet, only the game master reads a sheet, only of a member who shared it, and without `notes` or `portrait`; leaving,
 * removal and switching sharing off end access on the next request; blocks either way and bans refuse a join; the caps
 * run under the lock; the turn order changes only by compare-and-set; a rotated code refuses the old one.
 *
 * Prisma is replaced by a small in-memory store that understands exactly the `where` shapes the module uses.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Party {
  id: string;
  ownerId: string;
  name: string;
  system: string;
  inviteCode: string;
  initiative: unknown;
  turnIndex: number;
  orderVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
interface Member {
  partyId: string;
  userId: string;
  characterId: string;
  sheetShared: boolean;
  joinedAt: Date;
}
interface Char {
  id: string;
  userId: string;
  system: string;
  data: Record<string, unknown>;
}

const store = vi.hoisted(() => ({
  parties: [] as Party[],
  members: [] as Member[],
  chars: [] as Char[],
  users: [] as { id: string; name: string; handle: string | null; bannedUntil: Date | null }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  locks: [] as string[],
  seq: 0,
  /** Every `select` that asked for a sheet's `data`. */
  dataSelects: 0,
}));

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where | undefined, kind: 'party' | 'member'): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, want]) => {
    if (key === 'OR') return (want as Where[]).some((w) => matches(row, w, kind));
    if (key === 'members') {
      const some = (want as { some: Where }).some;
      return store.members.some((m) => m.partyId === row.id && matches(m as never, some, 'member'));
    }
    if (key === 'party') {
      const p = store.parties.find((x) => x.id === row.partyId);
      return !!p && matches(p as never, want as Where, 'party');
    }
    if (want && typeof want === 'object' && 'in' in want) return (want as { in: unknown[] }).in.includes(row[key]);
    return row[key] === want;
  });
}

const chip = (id: string) => {
  const u = store.users.find((x) => x.id === id);
  return u ? { id: u.id, name: u.name, handle: u.handle, image: null } : null;
};

const partyRow = (p: Party) => ({
  ...p,
  owner: chip(p.ownerId),
  members: store.members
    .filter((m) => m.partyId === p.id)
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
    .map((m) => ({ ...m, user: chip(m.userId) })),
  _count: { members: store.members.filter((m) => m.partyId === p.id).length },
});

const db = {
  rmhCharacterParty: {
    findMany: async ({ where }: { where?: Where }) =>
      store.parties.filter((p) => matches(p as never, where, 'party')).map(partyRow),
    findFirst: async ({ where }: { where?: Where }) => {
      const p = store.parties.find((x) => matches(x as never, where, 'party'));
      return p ? partyRow(p) : null;
    },
    findUnique: async ({ where }: { where: { inviteCode: string } }) => {
      const p = store.parties.find((x) => x.inviteCode === where.inviteCode);
      return p ? partyRow(p) : null;
    },
    count: async ({ where }: { where?: Where }) =>
      store.parties.filter((p) => matches(p as never, where, 'party')).length,
    create: async ({ data }: { data: Partial<Party> }) => {
      const p: Party = {
        id: `party-${++store.seq}`,
        ownerId: '',
        name: '',
        system: '',
        inviteCode: '',
        initiative: [],
        turnIndex: 0,
        orderVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      store.parties.push(p);
      return p;
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const rows = store.parties.filter((p) => matches(p as never, where, 'party'));
      for (const p of rows) {
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v)
            (p as never as Record<string, number>)[k]! += (v as { increment: number }).increment;
          else (p as never as Record<string, unknown>)[k] = v;
        }
      }
      return { count: rows.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const rows = store.parties.filter((p) => matches(p as never, where, 'party'));
      store.parties = store.parties.filter((p) => !rows.includes(p));
      store.members = store.members.filter((m) => !rows.some((p) => p.id === m.partyId));
      return { count: rows.length };
    },
  },
  rmhCharacterPartyMember: {
    findMany: async ({ where }: { where: Where }) =>
      store.members
        .filter((m) => matches(m as never, where, 'member'))
        .map((m) => ({ ...m, party: store.parties.find((p) => p.id === m.partyId) })),
    findFirst: async ({ where }: { where: Where }) => {
      const m = store.members.find((x) => matches(x as never, where, 'member'));
      const party = m && store.parties.find((p) => p.id === m.partyId);
      return m ? { ...m, party } : null;
    },
    count: async ({ where }: { where: Where }) =>
      store.members.filter((m) => matches(m as never, where, 'member')).length,
    create: async ({ data }: { data: Omit<Member, 'joinedAt'> }) => {
      store.members.push({ ...data, joinedAt: new Date(Date.now() + store.members.length) });
      return data;
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const rows = store.members.filter((m) => matches(m as never, where, 'member'));
      store.members = store.members.filter((m) => !rows.includes(m));
      return { count: rows.length };
    },
    updateMany: async ({ where, data }: { where: Where; data: Partial<Member> }) => {
      const rows = store.members.filter((m) => matches(m as never, where, 'member'));
      for (const m of rows) Object.assign(m, data);
      return { count: rows.length };
    },
  },
  rmhCharacter: {
    findMany: async ({ where, select }: { where: Where; select: Record<string, boolean> }) => {
      if (select.data) store.dataSelects++;
      return store.chars.filter((c) => matches(c as never, where, 'member')).map((c) => ({ ...c }));
    },
    findFirst: async ({ where }: { where: Where }) =>
      store.chars.find((c) => matches(c as never, where, 'member')) ?? null,
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => store.users.find((u) => u.id === where.id) ?? null,
  },
  userBlock: {
    findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
      store.blocks.find((b) => where.OR.some((w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId)) ??
      null,
  },
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    store.locks.push(String(values[0]));
    return 1;
  },
};
const prismaMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, key: string) =>
        key === '$transaction'
          ? async (fn: (tx: unknown) => unknown) => fn(prismaMock.current)
          : (prismaMock.current as Record<string, unknown>)[key],
    },
  ),
}));
prismaMock.current = db;

const getSession = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));

import {
  createParty,
  exportCharacterParties,
  getParty,
  joinParty,
  leaveParty,
  listParties,
  readPartySheet,
  removeMember,
  rotateCode,
  setSheetShared,
  swapCharacter,
  writeOrder,
} from '../../engine/party.server';
import { PARTY_MAX_MEMBERS, PARTY_MAX_PLAYING, PARTY_MAX_RUN } from '../../engine/party-limits';
import { newDnd5e, newPf2e } from '../../engine/factory';
import { route as sheetRoute } from '../rmhcharacters.parties.$id.sheet.$userId.server';
import { route as orderRoute } from '../rmhcharacters.parties.$id.order.server';
import { route as partyRoute } from '../rmhcharacters.parties.$id.server';

const PORTRAIT = 'data:image/png;base64,AAAA';

function sheet(over: Record<string, unknown> = {}) {
  return {
    ...newDnd5e(),
    name: 'Ilsa',
    playerName: 'Real Name',
    notes: 'PRIVATE NOTES',
    portrait: PORTRAIT,
    backstory: 'A long story',
    speciesId: 'human',
    classes: [{ classId: 'fighter', level: 2, hpRolls: [null] }],
    hp: { current: 9, temp: 0 },
    ...over,
  } as Record<string, unknown>;
}

function addUser(id: string, over: Partial<(typeof store.users)[number]> = {}) {
  store.users.push({ id, name: `Name ${id}`, handle: id, bannedUntil: null, ...over });
}
function addChar(id: string, userId: string, data: Record<string, unknown> = sheet({ id })) {
  store.chars.push({ id, userId, system: String(data.system), data });
}
function addParty(over: Partial<Party> = {}): Party {
  const p: Party = {
    id: `party-${++store.seq}`,
    ownerId: 'gm',
    name: 'Tuesday',
    system: 'dnd5e',
    inviteCode: `code-${store.seq}-abcdefg`.slice(0, 16),
    initiative: [],
    turnIndex: 0,
    orderVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
  store.parties.push(p);
  return p;
}
function addMember(partyId: string, userId: string, characterId: string, sheetShared = false) {
  store.members.push({
    partyId,
    userId,
    characterId,
    sheetShared,
    joinedAt: new Date(Date.now() + store.members.length),
  });
}

beforeEach(() => {
  store.parties = [];
  store.members = [];
  store.chars = [];
  store.users = [];
  store.blocks = [];
  store.locks = [];
  store.seq = 0;
  store.dataSelects = 0;
  for (const u of ['gm', 'p1', 'p2', 'outsider']) addUser(u);
  addChar('c-gm', 'gm');
  addChar('c-p1', 'p1', sheet({ id: 'c-p1', name: 'Brannoc' }));
  addChar('c-p2', 'p2', sheet({ id: 'c-p2', name: 'Cael' }));
  addChar('c-out', 'outsider', sheet({ id: 'c-out', name: 'Dane' }));
});

describe('reading a party', () => {
  it('answers a non-member with nothing, and a member with the summary only', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    addMember(p.id, 'p2', 'c-p2', true);
    expect(await getParty(p.id, 'outsider')).toBeNull();
    expect(await getParty('missing', 'p1')).toBeNull();

    const view = await getParty(p.id, 'p1');
    expect(view?.role).toBe('player');
    expect(view?.members.map((m) => m.summary?.name)).toEqual(['Brannoc', 'Cael']);
    const json = JSON.stringify(view);
    for (const secret of ['PRIVATE NOTES', PORTRAIT, 'Real Name', 'A long story']) expect(json).not.toContain(secret);
    // The invite code is the game master's; another player's sharing choice is not shown to a player.
    expect(view?.inviteCode).toBeNull();
    expect(view?.members.find((m) => m.userId === 'p2')?.sheetShared).toBe(false);
  });

  it('shows the game master the code and each player’s sharing choice', async () => {
    const p = addParty();
    addMember(p.id, 'p2', 'c-p2', true);
    const view = await getParty(p.id, 'gm');
    expect(view?.role).toBe('gm');
    expect(view?.inviteCode).toBe(p.inviteCode);
    expect(view?.members[0]?.sheetShared).toBe(true);
  });

  it('lists the parties a member runs or plays in, not others', async () => {
    const mine = addParty();
    const other = addParty({ ownerId: 'outsider', name: 'Elsewhere' });
    addMember(other.id, 'p2', 'c-p2');
    addMember(mine.id, 'p1', 'c-p1');
    expect((await listParties('p1')).map((x) => x.id)).toEqual([mine.id]);
    expect((await listParties('gm')).map((x) => x.role)).toEqual(['gm']);
  });

  it('reads a sheet’s data in exactly one place', () => {
    const src = readFileSync(new URL('../../engine/party.server.ts', import.meta.url), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(src.match(/data:\s*true/g)?.length).toBe(1);
  });
});

describe('the game master’s sheet read', () => {
  it('returns the sheet of a sharing member without notes or portrait', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1', true);
    const s = await readPartySheet(p.id, 'gm', 'p1');
    expect(s).not.toBeNull();
    expect(s).not.toHaveProperty('notes');
    expect(s).not.toHaveProperty('portrait');
    expect(s?.name).toBe('Brannoc');
    expect(JSON.stringify(s)).not.toContain('PRIVATE NOTES');
  });

  it('refuses everyone but the game master', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1', true);
    addMember(p.id, 'p2', 'c-p2', true);
    expect(await readPartySheet(p.id, 'p2', 'p1')).toBeNull();
    expect(await readPartySheet(p.id, 'outsider', 'p1')).toBeNull();
  });

  it('refuses a member who has not shared (the default)', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    expect(await readPartySheet(p.id, 'gm', 'p1')).toBeNull();
  });

  it('refuses at once after sharing is switched off, the player leaves, or is removed', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1', true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).not.toBeNull();
    expect(await setSheetShared(p.id, 'p1', false)).toBe(true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).toBeNull();
    await setSheetShared(p.id, 'p1', true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).not.toBeNull();
    expect(await leaveParty(p.id, 'p1')).toBe(true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).toBeNull();
    addMember(p.id, 'p1', 'c-p1', true);
    expect(await removeMember(p.id, 'gm', 'p1')).toBe(true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).toBeNull();
  });

  it('refuses a character that is not the member’s own', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-out', true);
    expect(await readPartySheet(p.id, 'gm', 'p1')).toBeNull();
  });

  it('sets sharing for the caller’s own membership only', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    expect(await setSheetShared(p.id, 'outsider', true)).toBe(false);
    expect(store.members[0]?.sheetShared).toBe(false);
  });
});

describe('the sheet and party routes', () => {
  const handler = (r: unknown, m: string) =>
    (r as { handlers: Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>> })
      .handlers[m]!;
  let ip = 0;
  const req = (method: string, body?: unknown) =>
    new Request('https://rmhstudios.com/api/rmhcharacters/parties/x', {
      method,
      headers: {
        cookie: 'better-auth.session_token=x',
        'content-type': 'application/json',
        'cf-connecting-ip': `10.8.0.${ip++ % 250}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  it('answers a refused sheet read with 404 whatever the reason, and a good one uncached', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1', true);
    addMember(p.id, 'p2', 'c-p2');
    getSession.mockResolvedValue({ user: { id: 'gm' } });
    const ok = await handler(sheetRoute, 'GET')({ request: req('GET'), params: { id: p.id, userId: 'p1' } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
    const body = (await ok.json()) as { character: Record<string, unknown> };
    expect(body.character).not.toHaveProperty('notes');
    expect(body.character).not.toHaveProperty('portrait');
    // not shared, not a member, a stranger's party: indistinguishable
    for (const userId of ['p2', 'outsider', 'nobody']) {
      const r = await handler(sheetRoute, 'GET')({ request: req('GET'), params: { id: p.id, userId } });
      expect(r.status).toBe(404);
      expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    }
    getSession.mockResolvedValue({ user: { id: 'p1' } });
    const asPlayer = await handler(sheetRoute, 'GET')({ request: req('GET'), params: { id: p.id, userId: 'p1' } });
    expect(asPlayer.status).toBe(404);
  });

  it('answers a non-member’s party read with 404 and a member’s uncached', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    getSession.mockResolvedValue({ user: { id: 'outsider' } });
    expect((await handler(partyRoute, 'GET')({ request: req('GET'), params: { id: p.id } })).status).toBe(404);
    getSession.mockResolvedValue({ user: { id: 'p1' } });
    const r = await handler(partyRoute, 'GET')({ request: req('GET'), params: { id: p.id } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('lets only the game master write the order', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    const body = {
      op: 'set',
      version: 0,
      initiative: [{ id: 'a', kind: 'extra', name: 'Goblin 1', value: 12 }],
      turnIndex: 0,
    };
    getSession.mockResolvedValue({ user: { id: 'p1' } });
    expect((await handler(orderRoute, 'PUT')({ request: req('PUT', body), params: { id: p.id } })).status).toBe(404);
    expect(p.orderVersion).toBe(0);
    getSession.mockResolvedValue({ user: { id: 'gm' } });
    const r = await handler(orderRoute, 'PUT')({ request: req('PUT', body), params: { id: p.id } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { orderVersion: number }).orderVersion).toBe(1);
  });
});

describe('joining', () => {
  const join = (userId: string, code: string, characterId: string, sheetShared = false) =>
    joinParty(userId, { code, characterId, sheetShared });

  it('joins with the code and a character of the party’s system, sharing off unless asked', async () => {
    const p = addParty();
    const r = await join('p1', p.inviteCode, 'c-p1');
    expect(r).toEqual({ ok: true, id: p.id });
    expect(store.members[0]).toMatchObject({ userId: 'p1', characterId: 'c-p1', sheetShared: false });
    await join('p2', p.inviteCode, 'c-p2', true);
    expect(store.members[1]?.sheetShared).toBe(true);
  });

  it('refuses the wrong system, someone else’s character, and a second join', async () => {
    const p = addParty();
    addChar('c-pf', 'p1', { ...newPf2e(), id: 'c-pf', name: 'Pf' });
    expect(await join('p1', p.inviteCode, 'c-pf')).toEqual({ ok: false, code: 'PARTY_SYSTEM_MISMATCH' });
    expect(await join('p1', p.inviteCode, 'c-p2')).toEqual({ ok: false, code: 'NOT_FOUND' });
    await join('p1', p.inviteCode, 'c-p1');
    expect(await join('p1', p.inviteCode, 'c-p1')).toEqual({ ok: false, code: 'PARTY_ALREADY_MEMBER' });
  });

  it('refuses a member the game master blocked, and one who blocked the game master', async () => {
    const p = addParty();
    store.blocks.push({ blockerId: 'gm', blockedId: 'p1' });
    store.blocks.push({ blockerId: 'p2', blockedId: 'gm' });
    expect(await join('p1', p.inviteCode, 'c-p1')).toEqual({ ok: false, code: 'PARTY_JOIN_REFUSED' });
    expect(await join('p2', p.inviteCode, 'c-p2')).toEqual({ ok: false, code: 'PARTY_JOIN_REFUSED' });
    expect(store.members).toHaveLength(0);
  });

  it('refuses an account under a ban, and lets a lapsed ban through', async () => {
    const p = addParty();
    store.users.find((u) => u.id === 'p1')!.bannedUntil = new Date(Date.now() + 86_400_000);
    store.users.find((u) => u.id === 'p2')!.bannedUntil = new Date(Date.now() - 1000);
    expect(await join('p1', p.inviteCode, 'c-p1')).toEqual({ ok: false, code: 'PARTY_JOIN_REFUSED' });
    expect(await join('p2', p.inviteCode, 'c-p2')).toMatchObject({ ok: true });
  });

  it('fills at eight players, under the party’s lock', async () => {
    const p = addParty();
    for (let i = 0; i < PARTY_MAX_MEMBERS; i++) {
      addUser(`m${i}`);
      addChar(`cm${i}`, `m${i}`);
      expect(await join(`m${i}`, p.inviteCode, `cm${i}`)).toMatchObject({ ok: true });
    }
    expect(await join('p1', p.inviteCode, 'c-p1')).toEqual({ ok: false, code: 'PARTY_FULL' });
    expect(store.members).toHaveLength(PARTY_MAX_MEMBERS);
    expect(store.locks).toContain(`character-party:${p.id}`);
    expect(store.locks).toContain('character-party-owner:p1');
  });

  it('caps the parties one member plays in at twenty', async () => {
    for (let i = 0; i < PARTY_MAX_PLAYING; i++) addMember(addParty({ ownerId: 'outsider' }).id, 'p1', 'c-p1');
    const p = addParty();
    expect(await join('p1', p.inviteCode, 'c-p1')).toEqual({ ok: false, code: 'PARTY_LIMIT' });
  });

  it('refuses a rotated code and accepts the new one', async () => {
    const p = addParty();
    const old = p.inviteCode;
    const fresh = await rotateCode(p.id, 'gm');
    expect(fresh).toMatch(/^[\w-]{16}$/);
    expect(fresh).not.toBe(old);
    expect(await join('p1', old, 'c-p1')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await join('p1', fresh!, 'c-p1')).toMatchObject({ ok: true });
    expect(await rotateCode(p.id, 'p1')).toBeNull();
  });
});

describe('running parties', () => {
  it('caps the parties one member runs at ten, under their lock', async () => {
    for (let i = 0; i < PARTY_MAX_RUN; i++)
      expect(await createParty('gm', { name: `P${i}`, system: 'dnd5e' })).toMatchObject({ ok: true });
    expect(await createParty('gm', { name: 'One too many', system: 'dnd5e' })).toEqual({
      ok: false,
      code: 'PARTY_LIMIT',
    });
    expect(store.locks.every((l) => l === 'character-party-owner:gm')).toBe(true);
    expect(store.parties.every((p) => /^[\w-]{16}$/.test(p.inviteCode))).toBe(true);
  });

  it('lets a player swap to their own character of the party’s system only', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    addChar('c-p1b', 'p1', sheet({ id: 'c-p1b', name: 'Second' }));
    addChar('c-pf', 'p1', { ...newPf2e(), id: 'c-pf' });
    expect(await swapCharacter(p.id, 'p1', 'c-p1b')).toEqual({ ok: true });
    expect(store.members[0]?.characterId).toBe('c-p1b');
    expect(await swapCharacter(p.id, 'p1', 'c-pf')).toEqual({ ok: false, code: 'PARTY_SYSTEM_MISMATCH' });
    expect(await swapCharacter(p.id, 'p1', 'c-p2')).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await swapCharacter(p.id, 'outsider', 'c-out')).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('lets only the game master remove a player', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    expect(await removeMember(p.id, 'p2', 'p1')).toBe(false);
    expect(await removeMember(p.id, 'gm', 'p1')).toBe(true);
  });
});

describe('the turn order', () => {
  const set = (version: number, initiative: unknown[], turnIndex = 0) =>
    ({ op: 'set', version, initiative, turnIndex }) as Parameters<typeof writeOrder>[2];

  it('changes by compare-and-set: a stale version is refused and nothing is written', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    const a = await writeOrder(
      p.id,
      'gm',
      set(0, [
        { id: 'a', kind: 'member', userId: 'p1', value: 15 },
        { id: 'b', kind: 'extra', name: 'Goblin 1', value: 9 },
      ]),
    );
    expect(a).toMatchObject({ ok: true, result: { orderVersion: 1, turnIndex: 0 } });
    const stale = await writeOrder(p.id, 'gm', set(0, [{ id: 'c', kind: 'extra', name: 'Overwrite', value: 1 }]));
    expect(stale).toEqual({ ok: false, code: 'PARTY_ORDER_CHANGED' });
    expect(p.orderVersion).toBe(1);
    expect(JSON.stringify(p.initiative)).not.toContain('Overwrite');
  });

  it('does not let two writers at the same version both win', async () => {
    const p = addParty();
    const body = (name: string) => set(0, [{ id: name, kind: 'extra', name, value: 1 }]);
    const [x, y] = await Promise.all([writeOrder(p.id, 'gm', body('one')), writeOrder(p.id, 'gm', body('two'))]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(p.orderVersion).toBe(1);
  });

  it('advances on the server, wrapping round, and shows players the names read from the membership', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    await writeOrder(
      p.id,
      'gm',
      set(0, [
        { id: 'a', kind: 'member', userId: 'p1', value: 15 },
        { id: 'b', kind: 'extra', name: 'Goblin 1', value: 9 },
      ]),
    );
    expect(await writeOrder(p.id, 'gm', { op: 'advance', version: 1 })).toMatchObject({
      ok: true,
      result: { turnIndex: 1, orderVersion: 2 },
    });
    expect(await writeOrder(p.id, 'gm', { op: 'advance', version: 2 })).toMatchObject({
      ok: true,
      result: { turnIndex: 0, orderVersion: 3 },
    });
    const view = await getParty(p.id, 'p1');
    expect(view?.order.map((l) => l.name)).toEqual(['Name p1', 'Goblin 1']);
    expect(JSON.stringify(p.initiative)).not.toContain('Name p1');
    // an advance with an old version is refused too
    expect(await writeOrder(p.id, 'gm', { op: 'advance', version: 1 })).toEqual({
      ok: false,
      code: 'PARTY_ORDER_CHANGED',
    });
  });

  it('refuses a non-game-master, a non-member line, a repeated id, too many extras and a turn past the end', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    const line = { id: 'a', kind: 'extra' as const, name: 'X', value: 1 };
    expect(await writeOrder(p.id, 'p1', set(0, [line]))).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await writeOrder(p.id, 'gm', set(0, [{ id: 'm', kind: 'member', userId: 'outsider', value: 1 }]))).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(await writeOrder(p.id, 'gm', set(0, [line, line]))).toEqual({ ok: false, code: 'INVALID_INPUT' });
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `e${i}`,
      kind: 'extra' as const,
      name: `E${i}`,
      value: i,
    }));
    expect(await writeOrder(p.id, 'gm', set(0, many))).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await writeOrder(p.id, 'gm', set(0, [line], 3))).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(p.orderVersion).toBe(0);
  });

  it('drops a line for a player who has left', async () => {
    const p = addParty();
    addMember(p.id, 'p1', 'c-p1');
    await writeOrder(
      p.id,
      'gm',
      set(
        0,
        [
          { id: 'a', kind: 'member', userId: 'p1', value: 15 },
          { id: 'b', kind: 'extra', name: 'Goblin 1', value: 9 },
        ],
        1,
      ),
    );
    await leaveParty(p.id, 'p1');
    const view = await getParty(p.id, 'gm');
    expect(view?.order.map((l) => l.id)).toEqual(['b']);
    expect(view?.turnIndex).toBe(0);
  });
});

describe('the export', () => {
  it('carries the parties run (extras’ names) and the memberships', async () => {
    const p = addParty({
      initiative: [
        { id: 'b', kind: 'extra', name: 'Goblin 1', value: 9 },
        { id: 'a', kind: 'member', userId: 'p1', value: 1 },
      ],
    });
    const q = addParty({ ownerId: 'outsider', name: 'Elsewhere' });
    addMember(q.id, 'gm', 'c-gm');
    const out = await exportCharacterParties('gm');
    expect(out.partiesRun).toEqual([
      { name: p.name, system: 'dnd5e', created: p.createdAt.toISOString(), extras: ['Goblin 1'] },
    ]);
    expect(out.memberships).toMatchObject([{ partyName: 'Elsewhere', characterId: 'c-gm' }]);
  });
});
