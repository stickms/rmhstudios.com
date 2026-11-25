/**
 * Rolling for the table holds its promises: a non-member gets 404; a member with no character is refused with the
 * code; the modifier comes from the stored sheet and a forged one is ignored; `gm` and `secret` rolls reach only the
 * people they are for (filtered in the query); only the game master sets a DC; the trim keeps 200 under the lock; the
 * limit is 30 a minute per member; a removed player's next read is a 404.
 *
 * Prisma is replaced by a small in-memory store that understands exactly the `where` shapes the module uses.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordSource } from '@/lib/toolbox/random';
import { DND5E_DATA } from '../../engine/dnd5e/data/index';
import * as d5 from '../../engine/dnd5e/rules';
import { newDnd5e } from '../../engine/factory';
import { PARTY_ROLL_KEEP, PARTY_ROLL_PAGE } from '../../engine/party-rolls';
import { rollBody } from '../../engine/party-rolls-schema';

interface Roll {
  id: string;
  partyId: string;
  userId: string;
  characterId: string | null;
  kind: string;
  label: string;
  notation: string;
  dice: number[];
  modifier: number;
  total: number;
  mode: string;
  visibility: string;
  dc: number | null;
  degree: string | null;
  createdAt: Date;
}

const store = vi.hoisted(() => ({
  parties: [] as { id: string; ownerId: string; system: string; name: string }[],
  members: [] as { partyId: string; userId: string; characterId: string }[],
  chars: [] as { id: string; userId: string; name: string; data: Record<string, unknown> }[],
  users: [] as { id: string; bannedUntil: Date | null }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  rolls: [] as unknown[],
  locks: [] as string[],
  clock: 1_800_000_000_000,
  seq: 0,
  /** Every `where` a roll read used, to prove visibility is part of the query. */
  rollWheres: [] as unknown[],
}));

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, want]) => {
    if (key === 'OR') return (want as Where[]).some((w) => matches(row, w));
    if (key === 'AND') return (want as Where[]).every((w) => matches(row, w));
    if (key === 'members') {
      const some = (want as { some: Where }).some;
      return store.members.some((m) => m.partyId === row.id && matches(m as never, some));
    }
    if (key === 'party') {
      const p = store.parties.find((x) => x.id === row.partyId);
      return !!p && matches(p as never, want as Where);
    }
    if (want && typeof want === 'object' && 'in' in want) return (want as { in: unknown[] }).in.includes(row[key]);
    if (want && typeof want === 'object' && 'lt' in want) {
      const lt = (want as { lt: Date | string }).lt;
      return lt instanceof Date ? (row[key] as Date).getTime() < lt.getTime() : (row[key] as string) < lt;
    }
    if (want instanceof Date) return (row[key] as Date).getTime() === want.getTime();
    return row[key] === want;
  });
}

const rolls = () => store.rolls as Roll[];

const db = {
  rmhCharacterParty: {
    findFirst: async ({ where }: { where: Where }) => store.parties.find((p) => matches(p as never, where)) ?? null,
  },
  rmhCharacterPartyMember: {
    findFirst: async ({ where }: { where: Where }) => store.members.find((m) => matches(m as never, where)) ?? null,
    findMany: async ({ where }: { where: Where }) => store.members.filter((m) => matches(m as never, where)),
  },
  rmhCharacter: {
    findFirst: async ({ where }: { where: Where }) => store.chars.find((c) => matches(c as never, where)) ?? null,
    findMany: async ({ where }: { where: Where }) => store.chars.filter((c) => matches(c as never, where)),
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => store.users.find((u) => u.id === where.id) ?? null,
  },
  userBlock: {
    findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
      store.blocks.find((b) => where.OR.some((w) => w.blockerId === b.blockerId && w.blockedId === b.blockedId)) ??
      null,
  },
  rmhCharacterPartyRoll: {
    create: async ({ data }: { data: Omit<Roll, 'id' | 'createdAt'> }) => {
      const row: Roll = { ...data, id: `r${String(++store.seq).padStart(6, '0')}`, createdAt: new Date(store.clock++) };
      store.rolls.push(row);
      return { ...row };
    },
    findMany: async ({ where, skip = 0, take }: { where: Where; skip?: number; take?: number }) => {
      store.rollWheres.push(where);
      const sorted = rolls()
        .filter((r) => matches(r as never, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
      return sorted
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((r) => ({ ...r, party: { name: store.parties.find((p) => p.id === r.partyId)?.name ?? '' } }));
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const gone = rolls().filter((r) => matches(r as never, where));
      store.rolls = rolls().filter((r) => !gone.includes(r));
      return { count: gone.length };
    },
  },
  $executeRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
    store.locks.push(String(values[0]));
    return 1;
  },
};
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, key: string) =>
        key === '$transaction' ? async (fn: (tx: unknown) => unknown) => fn(db) : (db as Record<string, unknown>)[key],
    },
  ),
}));

import { exportPartyRolls, listPartyRolls, partyRollErasureOps, rollForParty } from '../../engine/party-rolls.server';

const fighterSheet = () => ({
  ...newDnd5e(),
  name: 'Ilsa',
  speciesId: 'human',
  backgroundId: 'soldier',
  baseAbilities: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
  classes: [{ classId: 'fighter', level: 5, hpRolls: [null, null, null, null] }],
  skills: ['stealth'],
  expertise: [],
  exhaustion: 0,
});
const stealth = () => d5.skillLines(fighterSheet() as never, DND5E_DATA).find((s) => s.id === 'stealth')!.bonus;

/** A word source that yields the given faces of the dice the roll draws, one after another. */
const faces = (...f: number[]): WordSource => {
  let i = 0;
  return () => (f[i++ % f.length] ?? 1) - 1;
};

const body = (roll: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  rollBody.parse({ roll, mode: 'normal', visibility: 'table', ...over });

function seed() {
  store.parties = [{ id: 'party-1', ownerId: 'gm', system: 'dnd5e', name: 'The Lanterns' }];
  store.members = [
    { partyId: 'party-1', userId: 'p1', characterId: 'c-p1' },
    { partyId: 'party-1', userId: 'p2', characterId: 'c-p2' },
  ];
  store.chars = [
    { id: 'c-p1', userId: 'p1', name: 'Brannoc', data: fighterSheet() as never },
    { id: 'c-p2', userId: 'p2', name: 'Ysolde', data: { ...fighterSheet(), name: 'Ysolde' } as never },
  ];
  store.users = ['gm', 'p1', 'p2', 'out'].map((id) => ({ id, bannedUntil: null }));
  store.blocks = [];
  store.rolls = [];
  store.locks = [];
  store.rollWheres = [];
  store.clock = 1_800_000_000_000;
  store.seq = 0;
}
beforeEach(seed);

describe('who may roll', () => {
  it('answers a non-member with 404 for the log and for a roll', async () => {
    expect(await listPartyRolls('out', 'party-1')).toBeNull();
    expect(await rollForParty('out', 'party-1', body({ kind: 'free', notation: '1d20' }))).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(rolls()).toHaveLength(0);
  });

  it('answers a removed player’s next read with 404', async () => {
    await rollForParty('p1', 'party-1', body({ kind: 'initiative' }), { rng: faces(10) });
    expect(await listPartyRolls('p1', 'party-1')).not.toBeNull();
    store.members = store.members.filter((m) => m.userId !== 'p1');
    expect(await listPartyRolls('p1', 'party-1')).toBeNull();
    expect(await rollForParty('p1', 'party-1', body({ kind: 'initiative' }))).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a banned member and a block either way with the game master', async () => {
    store.users.find((u) => u.id === 'p1')!.bannedUntil = new Date(Date.now() + 60_000);
    expect(await rollForParty('p1', 'party-1', body({ kind: 'initiative' }))).toMatchObject({ code: 'FORBIDDEN' });
    store.blocks = [{ blockerId: 'gm', blockedId: 'p2' }];
    expect(await rollForParty('p2', 'party-1', body({ kind: 'initiative' }))).toMatchObject({ code: 'FORBIDDEN' });
    // The reads are shut the same way: the log is other members' content.
    expect(await listPartyRolls('p1', 'party-1')).toBeNull();
    expect(await listPartyRolls('p2', 'party-1')).toBeNull();
    expect(await listPartyRolls('gm', 'party-1')).not.toBeNull();
  });

  it('refuses a game master without a character a sheet roll, with the code', async () => {
    expect(await rollForParty('gm', 'party-1', body({ kind: 'skill', key: 'stealth' }))).toEqual({
      ok: false,
      code: 'PARTY_ROLL_NO_CHARACTER',
    });
  });

  it('refuses a player whose character cannot be read, with the code', async () => {
    store.chars = store.chars.filter((c) => c.id !== 'c-p1');
    expect(await rollForParty('p1', 'party-1', body({ kind: 'skill', key: 'stealth' }))).toEqual({
      ok: false,
      code: 'PARTY_ROLL_NO_CHARACTER',
    });
  });
});

describe('the server rolls from the stored sheet', () => {
  it('uses the sheet’s modifier and the server’s dice, and ignores a forged modifier and total', async () => {
    const forged = rollBody.parse({
      roll: { kind: 'skill', key: 'stealth', modifier: 40, total: 99, dice: [20] },
      mode: 'normal',
      visibility: 'table',
      modifier: 40,
      total: 99,
    });
    const r = await rollForParty('p1', 'party-1', forged, { rng: faces(7) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.roll).toMatchObject({
      kind: 'skill',
      label: 'stealth',
      dice: [7],
      modifier: stealth(),
      total: 7 + stealth(),
    });
    expect(r.roll.who).toEqual({ kind: 'character', name: 'Brannoc' });
    const stored = rolls()[0]!;
    expect(stored).toMatchObject({ userId: 'p1', characterId: 'c-p1', total: 7 + stealth(), modifier: stealth() });
    expect(JSON.stringify(stored)).not.toContain('99');
  });

  it('rolls two dice with advantage and keeps the higher', async () => {
    const r = await rollForParty('p1', 'party-1', body({ kind: 'initiative' }, { mode: 'advantage' }), {
      rng: faces(4, 16),
    });
    if (!r.ok) throw new Error('refused');
    expect(r.roll.dice).toEqual([4, 16]);
    expect(r.roll.total).toBe(16 + d5.initiative(fighterSheet() as never, DND5E_DATA));
    expect(r.roll.mode).toBe('advantage');
  });

  it('refuses a request the sheet cannot answer', async () => {
    expect(await rollForParty('p1', 'party-1', body({ kind: 'strike', index: 0, map: 0 }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await rollForParty('p1', 'party-1', body({ kind: 'attack', index: 49 }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(rolls()).toHaveLength(0);
  });

  it('rolls damage and doubles the dice on a critical', async () => {
    const plain = await rollForParty('p1', 'party-1', body({ kind: 'damage', index: 0, critical: false }), {
      rng: faces(3),
    });
    const crit = await rollForParty('p1', 'party-1', body({ kind: 'damage', index: 0, critical: true }), {
      rng: faces(3),
    });
    if (!plain.ok || !crit.ok) throw new Error('refused');
    expect(crit.roll.dice.length).toBe(plain.roll.dice.length * 2);
    expect(crit.roll.label).toBe('d0c');
  });

  it('rolls free notation within the sheet’s limits', async () => {
    const r = await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '2d6+3' }), { rng: faces(2, 5) });
    expect(r.ok && r.roll).toMatchObject({ notation: '2d6+3', dice: [2, 5], modifier: 3, total: 10 });
    expect(await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '51d6' }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await rollForParty('p1', 'party-1', body({ kind: 'free', notation: 'nonsense' }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rolls from the operating system’s generator when no source is given', async () => {
    const r = await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '1d20' }));
    expect(r.ok && r.roll.dice[0]).toBeGreaterThanOrEqual(1);
    expect(r.ok && r.roll.dice[0]).toBeLessThanOrEqual(20);
    const src = readFileSync(new URL('../../engine/party-rolls.server.ts', import.meta.url), 'utf8');
    expect(src).toContain("from 'node:crypto'");
    expect(src).not.toMatch(/Math\.random/);
  });
});

describe('who sees what', () => {
  it('shows a gm roll to the roller and the game master only, and never a secret roll to a player', async () => {
    await rollForParty('p1', 'party-1', body({ kind: 'initiative' }, { visibility: 'gm' }), { rng: faces(10) });
    await rollForParty('p2', 'party-1', body({ kind: 'initiative' }), { rng: faces(11) });
    await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }, { visibility: 'secret' }), {
      rng: faces(12),
    });
    await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }), { rng: faces(13) });

    const totals = async (u: string) =>
      ((await listPartyRolls(u, 'party-1'))?.rolls ?? []).map((r) => r.dice[0]).sort();
    expect(await totals('gm')).toEqual([10, 11, 12, 13]);
    expect(await totals('p1')).toEqual([10, 11, 13]);
    expect(await totals('p2')).toEqual([11, 13]);
    for (const u of ['p1', 'p2']) {
      const list = await listPartyRolls(u, 'party-1');
      expect(list?.rolls.some((r) => r.visibility === 'secret')).toBe(false);
    }
  });

  it('filters in the query, so a hidden roll is never read for a player', async () => {
    await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }, { visibility: 'secret' }));
    store.rollWheres = [];
    await listPartyRolls('p1', 'party-1');
    expect(store.rollWheres).toHaveLength(1);
    expect(JSON.stringify(store.rollWheres[0])).toContain('"visibility":"table"');
    expect(JSON.stringify(store.rollWheres[0])).not.toContain('secret');
  });

  it('refuses the wrong choice for a role', async () => {
    expect(await rollForParty('p1', 'party-1', body({ kind: 'initiative' }, { visibility: 'secret' }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(
      await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }, { visibility: 'gm' })),
    ).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('names a roll from the character seated now, the game master, or a character who left', async () => {
    await rollForParty('p1', 'party-1', body({ kind: 'initiative' }), { rng: faces(5) });
    await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d4' }), { rng: faces(2) });
    // The character is renamed: the log follows the sheet's current name, nothing stale is stored.
    store.chars.find((c) => c.id === 'c-p1')!.name = 'Brannoc the Bold';
    let list = await listPartyRolls('p2', 'party-1');
    expect(list?.rolls.map((r) => r.who)).toEqual([{ kind: 'gm' }, { kind: 'character', name: 'Brannoc the Bold' }]);
    expect(JSON.stringify(rolls())).not.toContain('Brannoc');
    // The player swaps characters: the earlier roll belongs to a character who is no longer in the party.
    store.members.find((m) => m.userId === 'p1')!.characterId = 'c-p2';
    list = await listPartyRolls('p2', 'party-1');
    expect(list?.rolls.map((r) => r.who.kind)).toEqual(['gm', 'left']);
  });

  it('marks the viewer’s own rolls and carries the seat to open the sheet from', async () => {
    await rollForParty('p1', 'party-1', body({ kind: 'initiative' }));
    expect((await listPartyRolls('p1', 'party-1'))?.rolls[0]?.mine).toBe(true);
    expect((await listPartyRolls('p2', 'party-1'))?.rolls[0]?.mine).toBe(false);
    expect((await listPartyRolls('p2', 'party-1'))?.mine).toEqual({ characterId: 'c-p2' });
    expect((await listPartyRolls('gm', 'party-1'))?.mine).toEqual({ characterId: null });
  });
});

describe('the DC', () => {
  const pf = () => {
    store.parties[0]!.system = 'pf2e';
  };

  it('is refused from a player, with FORBIDDEN, and nothing is stored', async () => {
    pf();
    const r = await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '1d20' }, { dc: 15 }));
    expect(r).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(rolls()).toHaveLength(0);
  });

  it('is accepted from the game master on a secret Pathfinder roll and yields a degree', async () => {
    pf();
    const r = await rollForParty(
      'gm',
      'party-1',
      body({ kind: 'free', notation: '1d20+5' }, { visibility: 'secret', dc: 20 }),
      {
        rng: faces(16),
      },
    );
    expect(r.ok && r.roll).toMatchObject({ dc: 20, total: 21, degree: 'success', visibility: 'secret' });
  });

  it('is refused from the game master on a table roll or in 5e', async () => {
    expect(
      await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }, { visibility: 'secret', dc: 12 })),
    ).toMatchObject({ code: 'INVALID_INPUT' });
    pf();
    expect(await rollForParty('gm', 'party-1', body({ kind: 'free', notation: '1d20' }, { dc: 12 }))).toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

describe('the log is capped and paged', () => {
  it('keeps the newest 200 rolls, trimming in the transaction that inserts, under the party’s lock', async () => {
    for (let i = 0; i < PARTY_ROLL_KEEP + 5; i++)
      await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '1d20' }), { rng: faces((i % 20) + 1) });
    expect(rolls()).toHaveLength(PARTY_ROLL_KEEP);
    expect(store.locks.every((k) => k === 'party-rolls:party-1')).toBe(true);
    expect(store.locks).toHaveLength(PARTY_ROLL_KEEP + 5);
    // The oldest five are the ones that went.
    expect(rolls().some((r) => r.id === 'r000001')).toBe(false);
    expect(rolls().some((r) => r.id === 'r000006')).toBe(true);
  });

  it('pages the newest 50 first and the rest by cursor, without a gap or a repeat', async () => {
    for (let i = 0; i < 120; i++)
      await rollForParty('p1', 'party-1', body({ kind: 'free', notation: '1d20' }), { rng: faces(1) });
    const first = await listPartyRolls('p2', 'party-1');
    expect(first?.rolls).toHaveLength(PARTY_ROLL_PAGE);
    expect(first?.next).not.toBeNull();
    const second = await listPartyRolls('p2', 'party-1', first!.next!);
    const third = await listPartyRolls('p2', 'party-1', second!.next!);
    expect(third?.next).toBeNull();
    const ids = [...first!.rolls, ...second!.rolls, ...third!.rolls].map((r) => r.id);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(ids[0]).toBe('r000120');
  });
});

describe('limits', () => {
  it('limits a member to 30 table rolls a minute, per member', () => {
    const src = readFileSync(new URL('../rmhcharacters.parties.$id.rolls.server.ts', import.meta.url), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );
    expect(src).toMatch(/limit:\s*30,\s*windowMs:\s*60_000,\s*prefix:\s*'party-rolls',\s*scope:\s*'user'/);
    expect(src).toContain('rollBody');
    expect(src).toContain('listRollsQuery');
  });
});

describe('erasure and export', () => {
  it('deletes the member’s rolls and every roll in a party they run', () => {
    const ops = partyRollErasureOps('u9') as unknown[];
    expect(ops).toHaveLength(2);
  });

  it('exports the member’s own rolls with the party name, not the other members’', async () => {
    await rollForParty('p1', 'party-1', body({ kind: 'initiative' }), { rng: faces(9) });
    await rollForParty('p2', 'party-1', body({ kind: 'initiative' }), { rng: faces(9) });
    const out = await exportPartyRolls('p1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ partyName: 'The Lanterns', kind: 'initiative', dice: [9], visibility: 'table' });
  });
});
