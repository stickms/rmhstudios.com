/**
 * The public mod log keeps every page full while more public rows exist (S11-19). Event rows about a private, draft or
 * deleted event are excluded in the query, so they never shorten a page. Prisma is stood in for by a small table that
 * answers the two reads `listPublicModLog` makes the way the database would.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOD_LOG_PAGE_SIZE } from '@/lib/communities/modlog';

interface Row {
  id: bigint;
  communityId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ruleTitle: string | null;
  reason: string | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  publicEvents: new Set<string>(),
  queries: [] as { sql: string }[],
}));

type Fragment = { strings: string[]; values: unknown[] };

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    // The page's ids, as `listPublicModLog`'s SQL selects them: this community, a public action, before the cursor,
    // an event row only while its event is public, newest first, one more than a page.
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.queries.push({ sql: strings.join('?') });
      const [communityId, actions, cursorFragment, eventActions, limit] = values as [
        string,
        string[],
        Fragment,
        string[],
        number,
      ];
      const cursor = cursorFragment.values[0] as bigint | undefined;
      return h.rows
        .filter(
          (r) =>
            r.communityId === communityId &&
            actions.includes(r.action) &&
            (cursor === undefined || r.id < cursor) &&
            (!eventActions.includes(r.action) || (r.targetId !== null && h.publicEvents.has(r.targetId))),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id - a.id))
        .slice(0, limit)
        .map((r) => ({ id: r.id }));
    }),
    communityModAction: {
      findMany: vi.fn(async (args: { where: { id: { in: bigint[] } }; take: number }) =>
        h.rows
          .filter((r) => args.where.id.in.includes(r.id))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id - a.id))
          .slice(0, args.take),
      ),
    },
    // Reading an event's visibility row by row (the old way) must never happen again.
    event: { findMany: vi.fn(async () => [] as unknown[]) },
  },
}));

const { listPublicModLog } = await import('@/lib/communities/modlog.server');
const { prisma } = await import('@/lib/prisma.server');

const T0 = Date.parse('2026-11-20T10:00:00Z');
let nextId = 1n;
const add = (action: string, targetId: string | null = null, communityId = 'c1') => {
  const id = nextId++;
  h.rows.push({
    id,
    communityId,
    action,
    targetType: targetId ? 'event' : 'post',
    targetId,
    ruleTitle: null,
    reason: null,
    createdAt: new Date(T0 + Number(id) * 1000),
  });
  return id;
};

beforeEach(() => {
  h.rows = [];
  h.publicEvents = new Set(['ev-public']);
  h.queries = [];
  nextId = 1n;
});

/** Every page of the log, following the cursor. */
async function allPages(communityId = 'c1') {
  const pages: { id: string }[][] = [];
  let cursor: string | undefined;
  do {
    const page = await listPublicModLog(communityId, cursor);
    pages.push(page.entries);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && pages.length < 20);
  return pages;
}

describe('listPublicModLog pages', () => {
  it('fills a page when private events are mixed in, and the next page when more exist', async () => {
    // Newest first, every second row is about a private event: the old code dropped them after slicing the page.
    const publicIds: bigint[] = [];
    for (let i = 0; i < MOD_LOG_PAGE_SIZE + 20; i++) {
      add('event_hosted', 'ev-private');
      publicIds.push(add(i % 3 === 0 ? 'event_hosted' : 'content_removed', i % 3 === 0 ? 'ev-public' : null));
    }
    const pages = await allPages();
    expect(pages[0]).toHaveLength(MOD_LOG_PAGE_SIZE);
    expect(pages[1]).toHaveLength(20);
    expect(pages).toHaveLength(2);
    const seen = pages.flat().map((e) => BigInt(e.id));
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort((a, b) => Number(a - b))).toEqual(publicIds);
  });

  it('leaves out events that are draft, private or gone, and keeps rows that name no event', async () => {
    add('event_cancelled', 'ev-gone');
    add('event_hosted', 'ev-private');
    const kept = add('event_hosted', 'ev-public');
    const post = add('post_pinned');
    const { entries, nextCursor } = await listPublicModLog('c1', undefined);
    expect(entries.map((e) => e.id)).toEqual([String(post), String(kept)]);
    expect(nextCursor).toBeNull();
    expect(vi.mocked(prisma.event.findMany)).not.toHaveBeenCalled();
  });

  it('keeps its cursor format: the id of the last row of the page', async () => {
    for (let i = 0; i < MOD_LOG_PAGE_SIZE + 1; i++) add('content_removed');
    const first = await listPublicModLog('c1', undefined);
    expect(first.entries).toHaveLength(MOD_LOG_PAGE_SIZE);
    expect(first.nextCursor).toBe(first.entries[first.entries.length - 1]!.id);
    expect(first.nextCursor).toMatch(/^\d+$/);
    const second = await listPublicModLog('c1', first.nextCursor!);
    expect(second.entries.map((e) => e.id)).toEqual(['1']);
    expect(second.nextCursor).toBeNull();
  });

  it('never shows another community’s rows or a row whose action is not public', async () => {
    add('content_removed', null, 'other');
    add('member_banned');
    const own = add('content_removed');
    const { entries } = await listPublicModLog('c1', undefined);
    expect(entries.map((e) => e.id)).toEqual([String(own)]);
  });

  it('names the real tables and quoted columns', async () => {
    await listPublicModLog('c1', '10');
    const sql = h.queries[0]!.sql;
    expect(sql).toMatch(/FROM community_mod_action m/);
    expect(sql).toMatch(/m\."communityId" = \?/);
    expect(sql).toMatch(/FROM event e WHERE e\."id" = m\."targetId" AND e\."visibility" = 'PUBLIC'/);
  });

  it('reads the table and column names from the schema', () => {
    const model = (file: string, name: string) => {
      const src = readFileSync(join(__dirname, '..', '..', '..', 'prisma/schema', file), 'utf8');
      const from = src.indexOf(`model ${name} {`);
      return src.slice(from, src.indexOf('\n}\n', from));
    };
    const log = model('communities.prisma', 'CommunityModAction');
    expect(log).toMatch(/@@map\("community_mod_action"\)/);
    for (const column of ['id', 'communityId', 'action', 'targetId', 'createdAt']) {
      expect(log).toMatch(new RegExp(`\\n  ${column}\\s`));
    }
    const event = model('events.prisma', 'Event');
    expect(event).toMatch(/@@map\("event"\)/);
    for (const column of ['id', 'visibility']) expect(event).toMatch(new RegExp(`\\n  ${column}\\s`));
  });
});
