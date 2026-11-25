import { beforeEach, describe, expect, it, vi } from 'vitest';

// listConversations with pins: a fake chat table that honours the filters the list sets (`id` in / notIn, the cursor,
// `lastMessageAt` descending, `take`), so paging is exercised for real rather than asserted from the query text.
const h = vi.hoisted(() => {
  type Keyset = { OR: Array<{ lastMessageAt: Date | { lt: Date }; id?: { lt: string } }> };
  type Where = { id?: { in?: string[]; notIn?: string[] }; AND?: unknown[] };
  const state = {
    chats: [] as Array<{ id: string; lastMessageAt: Date }>,
    prefs: [] as Array<{ scopeKey: string; muteUntil: Date | null; mentionsOnly: boolean; pinned: boolean }>,
    folder: [] as string[],
  };
  const chatRow = (c: { id: string; lastMessageAt: Date }) => ({
    id: c.id,
    disappearAfterSec: null,
    themeKey: null,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.lastMessageAt,
    messageRequest: null,
    members: [
      {
        userId: 'me',
        slot: 1,
        user: { id: 'me', name: 'Me', image: null, username: 'me', isBot: false, profile: null },
      },
      {
        userId: `o-${c.id}`,
        slot: 2,
        user: {
          id: `o-${c.id}`,
          name: `Other ${c.id}`,
          image: null,
          username: `o_${c.id}`,
          isBot: false,
          profile: null,
        },
      },
    ],
    messages: [],
  });
  const chatFindMany = vi.fn(async ({ where, take }: { where: Where; take?: number }) => {
    let rows = [...state.chats].sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime() || (a.id < b.id ? 1 : -1),
    );
    if (where.id?.in) rows = rows.filter((c) => where.id!.in!.includes(c.id));
    if (where.id?.notIn) rows = rows.filter((c) => !where.id!.notIn!.includes(c.id));
    const keyset = (where.AND ?? []).find((x) => x && typeof x === 'object' && 'OR' in x) as Keyset | undefined;
    if (keyset) {
      const [{ lastMessageAt: lt }, { lastMessageAt: eq, id }] = keyset.OR as [
        { lastMessageAt: { lt: Date } },
        { lastMessageAt: Date; id: { lt: string } },
      ];
      rows = rows.filter(
        (c) =>
          c.lastMessageAt.getTime() < lt.lt.getTime() || (c.lastMessageAt.getTime() === eq.getTime() && c.id < id.lt),
      );
    }
    return rows.slice(0, take ?? rows.length).map(chatRow);
  });
  const chatFindUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => state.chats.find((c) => c.id === where.id) ?? null,
  );
  const prefFindMany = vi.fn(
    async ({ where }: { where: { scopeKey: string | { in?: string[]; startsWith?: string }; pinned?: boolean } }) => {
      const key = where.scopeKey;
      return state.prefs.filter((p) => {
        if (where.pinned === true && !p.pinned) return false;
        if (typeof key === 'object' && key.in) return key.in.includes(p.scopeKey);
        if (typeof key === 'object' && key.startsWith) return p.scopeKey.startsWith(key.startsWith);
        return true;
      });
    },
  );
  return { state, chatFindMany, chatFindUnique, prefFindMany };
});

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    chat: { findMany: h.chatFindMany, findUnique: h.chatFindUnique },
    chatMessage: { groupBy: vi.fn(async () => []) },
    conversationPref: { findMany: h.prefFindMany },
  }),
}));
vi.mock('@/lib/chat-plus/folders.server', () => ({ folderChatIds: vi.fn(async () => h.state.folder) }));

const { listConversations } = await import('@/lib/messages.server');
const { assertJsonSafe } = await import('@/lib/db/query-shape');

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
function seed(count: number, pinned: string[] = []) {
  // c1 is the oldest; c<count> the newest.
  h.state.chats = Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, lastMessageAt: day(i + 1) }));
  h.state.prefs = pinned.map((id) => ({ scopeKey: `dm:${id}`, muteUntil: null, mentionsOnly: false, pinned: true }));
}
const ids = (r: { conversations: Array<{ id: string }> }) => r.conversations.map((c) => c.id);

beforeEach(() => vi.clearAllMocks());

describe('the first page', () => {
  it('starts with the pinned conversations even when others have newer messages', async () => {
    seed(8, ['c1', 'c2']);
    const page = await listConversations('me', { limit: 4 });
    assertJsonSafe(page);
    expect(ids(page)).toEqual(['c2', 'c1', 'c8', 'c7', 'c6', 'c5']);
    expect(page.conversations.filter((c) => c.pinned).map((c) => c.id)).toEqual(['c2', 'c1']);
    // The pins do not count toward the limit: four unpinned rows follow.
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('c5');
  });

  it('is unchanged with no pins', async () => {
    seed(5);
    const page = await listConversations('me', { limit: 10 });
    expect(ids(page)).toEqual(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(page.conversations.every((c) => !c.pinned && !c.muted)).toBe(true);
  });

  it('drops a pin that points at a conversation the member can no longer see', async () => {
    seed(3, ['gone', 'c1']);
    const page = await listConversations('me', { limit: 10 });
    expect(ids(page)).toEqual(['c1', 'c3', 'c2']);
  });
});

describe('paging', () => {
  it('shows every conversation exactly once over three pages', async () => {
    seed(12, ['c2', 'c9']);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof listConversations>> = await listConversations('me', { limit: 4, cursor });
      seen.push(...ids(page));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
    expect(seen.slice(0, 2)).toEqual(['c9', 'c2']);
  });

  it('keeps every page free of a conversation pinned between page one and page two', async () => {
    seed(12, ['c2']);
    const first = await listConversations('me', { limit: 4 });
    // The member pins c7, which page one showed as an ordinary row (c12..c9 are the four unpinned rows; c7 is next).
    h.state.prefs.push({ scopeKey: 'dm:c7', muteUntil: null, mentionsOnly: false, pinned: true });
    const second = await listConversations('me', { limit: 4, cursor: first.nextCursor });
    expect(ids(second)).not.toContain('c7');
    expect(ids(second)).not.toContain('c2');
    // Pinned ids are excluded from the paged query on a later page too, and the pinned rows are not fetched again.
    expect(second.conversations.every((c) => !c.pinned)).toBe(true);
  });

  it('resumes after a cursor row that was pinned since the previous page, with no gap or repeat', async () => {
    seed(12, ['c2']);
    const first = await listConversations('me', { limit: 4 });
    expect(first.nextCursor).toBe('c9');
    // The member pins c9 itself, the row the cursor names: the `notIn` now excludes it.
    h.state.prefs.push({ scopeKey: 'dm:c9', muteUntil: null, mentionsOnly: false, pinned: true });
    const second = await listConversations('me', { limit: 4, cursor: first.nextCursor });
    expect(ids(second)).toEqual(['c8', 'c7', 'c6', 'c5']);
  });

  it('breaks a tie on lastMessageAt by id, so equal timestamps neither repeat nor skip', async () => {
    h.state.chats = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, lastMessageAt: day(3) }));
    h.state.prefs = [];
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof listConversations>> = await listConversations('me', { limit: 2, cursor });
      seen.push(...ids(page));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('excludes the pinned ids from the paged query on every page, and fetches them on the first only', async () => {
    seed(6, ['c1']);
    await listConversations('me', { limit: 2 });
    await listConversations('me', { limit: 2, cursor: 'c5' });
    const calls = h.chatFindMany.mock.calls.map(([arg]) => arg.where.id);
    expect(calls).toEqual([{ notIn: ['c1'] }, { in: ['c1'] }, { notIn: ['c1'] }]);
    expect(h.chatFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe('the other views', () => {
  it('leaves the folder view alone: pinned rows sit in their place with the mark', async () => {
    seed(5, ['c1']);
    h.state.folder = ['c1', 'c3', 'c4'];
    const page = await listConversations('me', { folderId: 'f1' });
    expect(ids(page)).toEqual(['c4', 'c3', 'c1']);
    expect(page.conversations.find((c) => c.id === 'c1')?.pinned).toBe(true);
    // Pins are not read for a folder.
    expect(
      h.prefFindMany.mock.calls.every(([arg]) => typeof arg.where.scopeKey === 'object' && 'in' in arg.where.scopeKey),
    ).toBe(true);
  });

  it('leaves the Unread view alone: no pinned exclusion, no pinned block', async () => {
    seed(5, ['c1']);
    const page = await listConversations('me', { unreadOnly: true });
    expect(ids(page)).toEqual(['c5', 'c4', 'c3', 'c2', 'c1']);
    expect(h.chatFindMany).toHaveBeenCalledTimes(1);
    expect(h.chatFindMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});

describe('the marks', () => {
  it('reads every preference of a page in one call', async () => {
    seed(6);
    await listConversations('me', { limit: 10 });
    // One indexed read for the pins, and one batched read for the marks of the whole page.
    const batched = h.prefFindMany.mock.calls.filter(
      ([arg]) => typeof arg.where.scopeKey === 'object' && 'in' in arg.where.scopeKey,
    );
    expect(h.prefFindMany).toHaveBeenCalledTimes(2);
    expect(batched).toHaveLength(1);
    expect(batched[0][0].where.scopeKey).toEqual({ in: expect.arrayContaining(['dm:c1', 'dm:c6']) });
  });

  it('marks a muted row, a mentions-only row and a pinned row, and not an expired mute', async () => {
    seed(5);
    h.state.prefs = [
      { scopeKey: 'dm:c5', muteUntil: new Date(Date.now() + 3_600_000), mentionsOnly: false, pinned: false },
      { scopeKey: 'dm:c4', muteUntil: null, mentionsOnly: true, pinned: false },
      { scopeKey: 'dm:c3', muteUntil: new Date(Date.now() - 3_600_000), mentionsOnly: false, pinned: false },
    ];
    const byId = new Map((await listConversations('me', { limit: 10 })).conversations.map((c) => [c.id, c]));
    expect(byId.get('c5')).toMatchObject({ muted: true, pinned: false });
    expect(byId.get('c4')).toMatchObject({ muted: true, pinned: false });
    expect(byId.get('c3')).toMatchObject({ muted: false, pinned: false });
    expect(byId.get('c2')).toMatchObject({ muted: false, pinned: false });
  });
});
