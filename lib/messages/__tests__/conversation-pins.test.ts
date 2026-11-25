import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake database with the two tables the pin write touches. `$transaction` runs one callback at a time, the way the
// advisory lock (`pg_advisory_xact_lock`) makes two writers for the same member queue.
const db = vi.hoisted(() => {
  type Pref = { userId: string; scopeKey: string; pinned: boolean; muteUntil: Date | null; mentionsOnly: boolean };
  const state = {
    prefs: [] as Pref[],
    /** chat id -> member ids */
    chats: new Map<string, string[]>(),
    locks: [] as unknown[][],
    chain: Promise.resolve() as Promise<unknown>,
  };
  const memberOf = (where: { AND?: Array<{ members?: { some: { userId: string } } }> }) =>
    where.AND?.[0]?.members?.some.userId ?? '';
  const chatFind = (where: { id?: string | { in: string[] } } & Parameters<typeof memberOf>[0]) => {
    const me = memberOf(where);
    const ids = typeof where.id === 'string' ? [where.id] : (where.id?.in ?? []);
    return ids.filter((id) => state.chats.get(id)?.includes(me)).map((id) => ({ id }));
  };
  const prefMatch = (p: Pref, where: Record<string, unknown>) => {
    if (where.userId !== p.userId) return false;
    const key = where.scopeKey as string | { in: string[] } | { startsWith: string } | undefined;
    if (typeof key === 'string' && key !== p.scopeKey) return false;
    if (key && typeof key === 'object' && 'in' in key && !key.in.includes(p.scopeKey)) return false;
    if (key && typeof key === 'object' && 'startsWith' in key && !p.scopeKey.startsWith(key.startsWith)) return false;
    if (where.pinned === true && !p.pinned) return false;
    return true;
  };
  const client = {
    chat: {
      findFirst: vi.fn(async ({ where }: { where: Parameters<typeof chatFind>[0] }) => chatFind(where)[0] ?? null),
      findMany: vi.fn(async ({ where }: { where: Parameters<typeof chatFind>[0] }) => chatFind(where)),
    },
    conversationPref: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.prefs.filter((p) => prefMatch(p, where)).map((p) => ({ scopeKey: p.scopeKey })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { userId_scopeKey: { userId: string; scopeKey: string } } }) => {
        const p = state.prefs.find(
          (r) => r.userId === where.userId_scopeKey.userId && r.scopeKey === where.userId_scopeKey.scopeKey,
        );
        return p ? { muteUntil: p.muteUntil, mentionsOnly: p.mentionsOnly, pinned: p.pinned } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { pinned: boolean } }) => {
        const hit = state.prefs.filter((p) => prefMatch(p, where));
        hit.forEach((p) => (p.pinned = data.pinned));
        return { count: hit.length };
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_scopeKey: { userId: string; scopeKey: string } };
          create: Partial<Pref> & { userId: string; scopeKey: string };
          update: Partial<Pref>;
        }) => {
          let p = state.prefs.find(
            (r) => r.userId === where.userId_scopeKey.userId && r.scopeKey === where.userId_scopeKey.scopeKey,
          );
          if (p) Object.assign(p, update);
          else {
            p = { ...{ muteUntil: null, mentionsOnly: false, pinned: false }, ...create };
            state.prefs.push(p);
          }
          return { muteUntil: p.muteUntil, mentionsOnly: p.mentionsOnly, pinned: p.pinned };
        },
      ),
    },
    $executeRaw: vi.fn(async (...args: unknown[]) => {
      state.locks.push(args);
      return 0;
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const run = state.chain.then(() => fn(client));
      state.chain = run.catch(() => undefined);
      return run;
    }),
  };
  return { state, client };
});

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked(db.client),
}));

const { pinnedChatIds, setPinned } = await import('@/lib/messages/pins.server');
const { CONVERSATION_PIN_LIMIT } = await import('@/lib/messages/pins');

const ME = 'me';
function seed(chatIds: string[], pinned: string[] = [], member: string[] = chatIds) {
  db.state.chats = new Map(chatIds.map((id) => [id, member.includes(id) ? [ME, `other-${id}`] : [`other-${id}`]]));
  db.state.prefs = pinned.map((id) => ({
    userId: ME,
    scopeKey: `dm:${id}`,
    pinned: true,
    muteUntil: null,
    mentionsOnly: false,
  }));
}
const pinnedNow = () => db.state.prefs.filter((p) => p.pinned).map((p) => p.scopeKey);

beforeEach(() => {
  db.state.locks = [];
  db.state.chain = Promise.resolve();
  vi.clearAllMocks();
});

describe('pinning a direct conversation', () => {
  it('pins under the member lock and answers the stored preference', async () => {
    seed(['a']);
    const out = await setPinned(ME, 'a', true);
    expect(out).toMatchObject({ ok: true, pref: { scopeKey: 'dm:a', pinned: true } });
    expect(pinnedNow()).toEqual(['dm:a']);
    expect(db.state.locks).toHaveLength(1);
    expect(JSON.stringify(db.state.locks[0])).toContain('pg_advisory_xact_lock');
    expect(JSON.stringify(db.state.locks[0])).toContain('conversation-pins:me');
  });

  it('refuses a sixth pin and leaves the five', async () => {
    const five = ['c1', 'c2', 'c3', 'c4', 'c5'];
    seed([...five, 'c6'], five);
    expect(CONVERSATION_PIN_LIMIT).toBe(5);
    expect(await setPinned(ME, 'c6', true)).toEqual({ ok: false, reason: 'limit' });
    expect(pinnedNow()).toHaveLength(5);
  });

  it('pinning an already pinned conversation at the limit is not a sixth', async () => {
    const five = ['c1', 'c2', 'c3', 'c4', 'c5'];
    seed(five, five);
    expect(await setPinned(ME, 'c3', true)).toMatchObject({ ok: true });
    expect(pinnedNow()).toHaveLength(5);
  });

  it('leaves five when two sixth pins arrive together', async () => {
    const four = ['c1', 'c2', 'c3', 'c4'];
    seed([...four, 'c5', 'c6'], four);
    const [x, y] = await Promise.all([setPinned(ME, 'c5', true), setPinned(ME, 'c6', true)]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect(pinnedNow()).toHaveLength(5);
  });

  it('refuses a conversation the caller is not in, so a fabricated key cannot take a slot', async () => {
    seed(['theirs'], [], []);
    expect(await setPinned(ME, 'theirs', true)).toEqual({ ok: false, reason: 'not-member' });
    expect(await setPinned(ME, 'does-not-exist', true)).toEqual({ ok: false, reason: 'not-member' });
    expect(pinnedNow()).toEqual([]);
  });

  it('clears pins of conversations the member left, so they do not count toward the limit', async () => {
    const five = ['c1', 'c2', 'c3', 'c4', 'c5'];
    seed(['c1', 'c2', 'c3', 'c4', 'c6'], five, ['c1', 'c2', 'c3', 'c4', 'c6']);
    // c5 is gone from the chat table: its pin is stale.
    expect(await setPinned(ME, 'c6', true)).toMatchObject({ ok: true });
    expect(pinnedNow().sort()).toEqual(['dm:c1', 'dm:c2', 'dm:c3', 'dm:c4', 'dm:c6']);
  });
});

describe('unpinning', () => {
  it('unpins without the lock or the cap check, even for a conversation the member left', async () => {
    seed(['a'], ['a', 'gone']);
    const out = await setPinned(ME, 'a', false);
    expect(out).toMatchObject({ ok: true, pref: { scopeKey: 'dm:a', pinned: false } });
    expect(await setPinned(ME, 'gone', false)).toMatchObject({ ok: true });
    expect(pinnedNow()).toEqual([]);
    expect(db.state.locks).toHaveLength(0);
  });

  it('does not create a row for a conversation that was never pinned', async () => {
    seed(['a']);
    await setPinned(ME, 'a', false);
    expect(db.state.prefs).toEqual([]);
  });
});

describe('reading the pins', () => {
  it('lists the chat ids of the direct pins, leaving other scopes out', async () => {
    seed(['a', 'b'], ['a', 'b']);
    db.state.prefs.push({ userId: ME, scopeKey: 'group:g1', pinned: true, muteUntil: null, mentionsOnly: false });
    expect((await pinnedChatIds(ME)).sort()).toEqual(['a', 'b']);
  });

  it('never writes', async () => {
    seed(['a'], ['stale']);
    await pinnedChatIds(ME);
    expect(db.client.conversationPref.updateMany).not.toHaveBeenCalled();
    expect(db.client.conversationPref.upsert).not.toHaveBeenCalled();
  });
});
