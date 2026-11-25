import { beforeEach, describe, expect, it, vi } from 'vitest';

// One rule for the party view, its sheets, its writes and the roll log (S12-01): a viewer under a ban, or blocked
// either way with the game master, gets null / not found from every read and write. A block between two players hides
// each from the other inside the party ("A player", no summary, no sheet state).

interface Block {
  blockerId: string;
  blockedId: string;
}
const h = vi.hoisted(() => ({
  bans: {} as Record<string, Date | null>,
  blocks: [] as { blockerId: string; blockedId: string }[],
  members: [] as { userId: string; characterId: string; sheetShared: boolean }[],
  ownerId: 'gm',
  updates: [] as string[],
}));

const hits = (b: Block, where: { OR?: Block[] }) =>
  (where.OR ?? []).some((w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId);

vi.mock('@/lib/prisma.server', () => {
  const memberRow = (m: (typeof h.members)[number]) => ({
    ...m,
    joinedAt: new Date('2026-12-01T00:00:00Z'),
    user: { id: m.userId, name: `Name ${m.userId}`, handle: m.userId },
  });
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id in h.bans ? { bannedUntil: h.bans[where.id] } : null,
        ),
      },
      userBlock: {
        findFirst: vi.fn(async ({ where }: { where: { OR?: Block[] } }) =>
          h.blocks.find((b) => hits(b, where)) ? { id: 'b' } : null,
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: { OR: { blockerId: string | { in: string[] }; blockedId: string | { in: string[] } }[] };
          }) =>
            h.blocks.filter((b) =>
              where.OR.some((w) => {
                const ok = (cond: string | { in: string[] }, v: string) =>
                  typeof cond === 'string' ? cond === v : cond.in.includes(v);
                return ok(w.blockerId, b.blockerId) && ok(w.blockedId, b.blockedId);
              }),
            ),
        ),
      },
      rmhCharacterParty: {
        findFirst: vi.fn(async () => ({
          id: 'p1',
          name: 'Table',
          system: 'dnd5e',
          ownerId: h.ownerId,
          inviteCode: 'code',
          initiative: h.members.map((m) => ({ id: `l-${m.userId}`, kind: 'member', userId: m.userId, value: 10 })),
          turnIndex: 0,
          orderVersion: 1,
          owner: { id: 'gm', name: 'Name gm', handle: 'gm' },
          members: h.members.map(memberRow),
        })),
        updateMany: vi.fn(async () => {
          h.updates.push('party');
          return { count: 1 };
        }),
      },
      rmhCharacterPartyMember: {
        findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => {
          const m = h.members.find((x) => x.userId === where.userId);
          return m ? { ...m, party: { system: 'dnd5e', ownerId: h.ownerId } } : null;
        }),
        updateMany: vi.fn(async () => {
          h.updates.push('member');
          return { count: 1 };
        }),
      },
      rmhCharacter: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => ({ system: 'dnd5e' })),
      },
    },
  };
});

const party = await import('@/features/rmhcharacters/engine/party.server');
const access = await import('@/features/rmhcharacters/engine/party-access.server');

const members = () => [
  { userId: 'p1', characterId: 'c1', sheetShared: true },
  { userId: 'p2', characterId: 'c2', sheetShared: true },
  { userId: 'p3', characterId: 'c3', sheetShared: true },
];

beforeEach(() => {
  h.bans = { gm: null, p1: null, p2: null, p3: null };
  h.blocks = [];
  h.members = members();
  h.ownerId = 'gm';
  h.updates = [];
});

describe('partyAccess', () => {
  it('lets the game master and an ordinary player in', async () => {
    expect(await access.partyAccess('gm', { ownerId: 'gm' })).toBe(true);
    expect(await access.partyAccess('p1', { ownerId: 'gm' })).toBe(true);
  });

  it('shuts out a banned viewer, an unknown account, and a block either way with the game master', async () => {
    h.bans.p1 = new Date(Date.now() + 3_600_000);
    expect(await access.partyAccess('p1', { ownerId: 'gm' })).toBe(false);
    h.bans.p1 = new Date(Date.now() - 3_600_000);
    expect(await access.partyAccess('p1', { ownerId: 'gm' })).toBe(true);
    expect(await access.partyAccess('nobody', { ownerId: 'gm' })).toBe(false);
    h.blocks = [{ blockerId: 'gm', blockedId: 'p2' }];
    expect(await access.partyAccess('p2', { ownerId: 'gm' })).toBe(false);
    h.blocks = [{ blockerId: 'p2', blockedId: 'gm' }];
    expect(await access.partyAccess('p2', { ownerId: 'gm' })).toBe(false);
  });

  it('a banned game master reads nothing either', async () => {
    h.bans.gm = new Date(Date.now() + 3_600_000);
    expect(await access.partyAccess('gm', { ownerId: 'gm' })).toBe(false);
  });
});

describe('every read and write answers not found for a banned or blocked player', () => {
  const reasons: [string, () => void][] = [
    ['banned', () => (h.bans.p1 = new Date(Date.now() + 3_600_000))],
    ['blocked by the game master', () => (h.blocks = [{ blockerId: 'gm', blockedId: 'p1' }])],
    ['blocking the game master', () => (h.blocks = [{ blockerId: 'p1', blockedId: 'gm' }])],
  ];
  for (const [label, apply] of reasons) {
    it(`${label}: getParty, swapCharacter and setSheetShared`, async () => {
      apply();
      expect(await party.getParty('p1', 'p1')).toBeNull();
      expect(await party.swapCharacter('p1', 'p1', 'c9')).toEqual({ ok: false, code: 'NOT_FOUND' });
      expect(await party.setSheetShared('p1', 'p1', false)).toBe(false);
      expect(h.updates).toEqual([]);
    });
  }

  it('a banned game master: getParty, writeOrder and readPartySheet', async () => {
    h.bans.gm = new Date(Date.now() + 3_600_000);
    expect(await party.getParty('p1', 'gm')).toBeNull();
    expect(await party.writeOrder('p1', 'gm', { op: 'advance', version: 1 })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await party.readPartySheet('p1', 'gm', 'p1')).toBeNull();
    expect(h.updates).toEqual([]);
  });

  it('the game master gets no sheet of a player they are blocked with, either way', async () => {
    h.blocks = [{ blockerId: 'p1', blockedId: 'gm' }];
    expect(await party.readPartySheet('p1', 'gm', 'p1')).toBeNull();
    h.blocks = [{ blockerId: 'gm', blockedId: 'p1' }];
    expect(await party.readPartySheet('p1', 'gm', 'p1')).toBeNull();
  });

  it('an allowed player still writes', async () => {
    expect(await party.setSheetShared('p1', 'p1', false)).toBe(true);
    expect(await party.swapCharacter('p1', 'p1', 'c9')).toEqual({ ok: true });
    expect(h.updates).toEqual(['member', 'member']);
  });
});

describe('a block between two players', () => {
  it('shows each as "A player" to the other: no name, summary, sheet state or turn-order name', async () => {
    h.blocks = [{ blockerId: 'p2', blockedId: 'p3' }];
    const seenByP2 = await party.getParty('p1', 'p2');
    const p3 = seenByP2?.members.find((m) => m.userId === 'p3');
    expect(p3).toMatchObject({ hidden: true, name: '', summary: null, sheetShared: false });
    expect(seenByP2?.order.find((l) => l.userId === 'p3')).toMatchObject({ hidden: true, name: '' });
    expect(seenByP2?.members.find((m) => m.userId === 'p1')).toMatchObject({ name: 'Name p1' });
    expect(seenByP2?.members.find((m) => m.userId === 'p1')?.hidden).toBe(false);

    const seenByP3 = await party.getParty('p1', 'p3');
    expect(seenByP3?.members.find((m) => m.userId === 'p2')).toMatchObject({ hidden: true, name: '' });
    // A reader the block does not touch sees both.
    const seenByP1 = await party.getParty('p1', 'p1');
    expect(seenByP1?.members.map((m) => m.name)).toEqual(['Name p1', 'Name p2', 'Name p3']);
  });

  it('a viewer is never hidden from themselves', async () => {
    h.blocks = [{ blockerId: 'p2', blockedId: 'p2' }];
    expect([...(await access.hiddenFrom('p2', ['p2', 'p3']))]).toEqual([]);
  });

  it('the developer API read follows: the hidden player is named "A player" there too', async () => {
    h.blocks = [{ blockerId: 'p2', blockedId: 'p3' }];
    const api = await import('@/lib/api/v1/characters.server');
    const detail = await api.getPartyForKey('p2', 'p1');
    expect(detail?.members.find((m) => m.userId === 'p3')).toMatchObject({ name: 'A player', summary: null });
    expect(detail?.order.find((l) => l.userId === 'p3')?.name).toBe('A player');
    h.bans.p2 = new Date(Date.now() + 3_600_000);
    expect(await api.getPartyForKey('p2', 'p1')).toBeNull();
  });
});

describe('the roll log uses the same rule', () => {
  it('imports partyAccess and keeps no rule of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'party-rolls.server.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(src).toMatch(/partyAccess\(userId, party\)/);
    expect(src).not.toMatch(/shutOut/);
    expect(src).not.toMatch(/userBlock/);
  });
});
