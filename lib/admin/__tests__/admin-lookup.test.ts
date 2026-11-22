/**
 * s05-10 admin lookup, through the real endpoint wrapper with Prisma stood in for by a small
 * in-memory store: non-admins are refused, a user id resolves with its ban state, a post link
 * resolves to the post, an e-mail matches exactly and the audit row never holds it, a message id
 * resolves to nothing and no chat model is ever read, and a resolver runs only for an input that
 * has its key's shape.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Rec = Record<string, unknown>;

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  tables: {} as Record<string, Rec[]>,
  calls: [] as string[],
  audits: [] as Rec[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const matches = (row: Rec, where: Rec): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Rec[]).some((w) => matches(row, w));
      if (typeof v === 'bigint') return row[k] === v;
      return row[k] === v;
    });
  const model = (name: string) => {
    const find = async (args: { where: Rec }) => {
      h.calls.push(name);
      return (h.tables[name] ?? []).find((r) => matches(r, args.where)) ?? null;
    };
    return {
      findUnique: vi.fn(find),
      findFirst: vi.fn(find),
    };
  };
  const prisma = {
    user: model('user'),
    rMHark: model('rMHark'),
    rMHarkComment: model('rMHarkComment'),
    community: model('community'),
    event: model('event'),
    tournament: model('tournament'),
    userBuild: model('userBuild'),
    gameReplay: model('gameReplay'),
    contentReport: model('contentReport'),
    moderatorNote: model('moderatorNote'),
    outboxEvent: model('outboxEvent'),
    gameJam: model('gameJam'),
    libraryDocument: model('libraryDocument'),
    newsArticle: model('newsArticle'),
    blogPost: model('blogPost'),
    // Private messages: any read at all is a failure of the feature.
    chatMessage: model('chatMessage'),
    groupCallMessage: model('groupCallMessage'),
    adminAuditLog: {
      create: vi.fn(async (a: { data: Rec }) => {
        h.audits.push(a.data);
        return a.data;
      }),
    },
  };
  return {
    prisma,
  };
});

const NOW = new Date('2026-11-21T12:00:00Z');
const CUID = (n: number) => `c${String(n).padStart(24, '0')}`;
const day = 86_400_000;

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;

async function lookup(q: string) {
  // The GET refuses an e-mail address (s07-13: it would sit in an access log); the single lookup's
  // behaviour for one is exercised through `runAdminLookup`, which the batch endpoint reuses.
  if (q.includes('@') && !q.startsWith('@')) {
    const { runAdminLookup } = await import('@/lib/admin/lookup.server');
    return {
      status: 200,
      json: (await runAdminLookup('admin-1', q)) as never,
    };
  }
  const { route } = await import('@/lib/admin/api/admin.lookup.server');
  const res = await (route.handlers as Handlers).GET!({
    request: new Request(`https://rmhstudios.com/api/admin/lookup?q=${encodeURIComponent(q)}`, {
      headers: {
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
    }),
    params: {},
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as {
      outcome: string;
      inputKind: string;
      tried: string[];
      results: Array<{
        kind: string;
        id: string;
        label: string;
        states: Array<{
          state: string;
          until?: string;
        }>;
        publicPath: string | null;
        adminTool: Rec | null;
        relatedQuery: string | null;
      }>;
    } | null,
  };
}

const admin = () => {
  h.session = {
    user: {
      id: 'admin-1',
      isAdmin: true,
    },
  };
};
const asked = () => [...new Set(h.calls)].sort();

const alice = {
  id: CUID(1),
  name: 'Alice',
  handle: 'alice',
  username: 'alice',
  email: 'alice@example.com',
  createdAt: new Date(NOW.getTime() - 30 * day),
  bannedUntil: new Date(NOW.getTime() + 7 * day),
  banReason: 'spam',
  isBot: false,
  isAdmin: false,
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['Date'],
  });
  vi.setSystemTime(NOW);
  h.session = null;
  h.calls.length = 0;
  h.audits.length = 0;
  h.tables = {
    user: [alice],
    rMHark: [
      {
        id: CUID(2),
        content: 'x'.repeat(200),
        createdAt: NOW,
        deletedAt: null,
        audience: 'PUBLIC',
        expiresAt: null,
        user: {
          handle: 'alice',
        },
        community: null,
      },
    ],
    contentReport: [
      {
        id: CUID(3),
        entityType: 'rmhark',
        entityId: CUID(2),
        status: 'PENDING',
        withdrawnAt: null,
        createdAt: NOW,
      },
      {
        id: CUID(4),
        entityType: 'dm',
        entityId: CUID(9),
        status: 'RESOLVED',
        withdrawnAt: null,
        createdAt: NOW,
      },
    ],
    outboxEvent: [
      {
        id: 42n,
        topic: 'webhook.post.created',
        createdAt: NOW,
        deliveredAt: null,
        deadAt: NOW,
      },
    ],
    community: [
      {
        id: CUID(5),
        slug: 'quiet',
        name: 'Quiet',
        isPrivate: true,
        createdAt: NOW,
      },
    ],
    // A direct message and a group message exist; the lookup must never find or read them.
    chatMessage: [
      {
        id: CUID(8),
        content: 'secret',
      },
    ],
  };
});

describe('s05-10 admin lookup: access', () => {
  it('refuses a signed-out visitor with 401 and reads nothing', async () => {
    expect((await lookup(CUID(1))).status).toBe(401);
    expect(h.calls).toEqual([]);
    expect(h.audits).toEqual([]);
  });
  it('refuses a signed-in non-admin with 403 and reads nothing', async () => {
    h.session = {
      user: {
        id: 'u1',
        isAdmin: false,
      },
    };
    expect((await lookup(CUID(1))).status).toBe(403);
    expect(h.calls).toEqual([]);
    expect(h.audits).toEqual([]);
  });
  it('refuses an empty or over-long query with 400', async () => {
    admin();
    expect((await lookup('   ')).status).toBe(400);
    expect((await lookup('a'.repeat(501))).status).toBe(400);
  });
});

describe('s05-10 admin lookup: resolving', () => {
  it('resolves a user id with its ban state and the admin and public links', async () => {
    admin();
    const { status, json } = await lookup(alice.id);
    expect(status).toBe(200);
    expect(json?.outcome).toBe('found');
    const user = json?.results.find((r) => r.kind === 'user');
    expect(user).toMatchObject({
      id: alice.id,
      label: '@alice',
      publicPath: '/u/alice',
      adminTool: {
        tool: 'users',
        q: 'alice',
        open: alice.id,
      },
    });
    expect(user?.states).toEqual([
      {
        state: 'banned',
        until: alice.bannedUntil.toISOString(),
      },
    ]);
  });

  it('does not call a lapsed ban banned', async () => {
    admin();
    h.tables.user![0] = {
      ...alice,
      bannedUntil: new Date(NOW.getTime() - day),
    };
    const { json } = await lookup(alice.id);
    expect(json?.results[0]?.states).toEqual([]);
  });

  it('resolves a post link to the post, with a label of at most 80 characters', async () => {
    admin();
    const { json } = await lookup(`https://rmhstudios.com/u/alice/post/${CUID(2)}?utm=x#c`);
    expect(json?.results).toHaveLength(1);
    const post = json!.results[0]!;
    expect(post).toMatchObject({
      kind: 'post',
      id: CUID(2),
      publicPath: `/u/alice/post/${CUID(2)}`,
    });
    expect(post.label.length).toBeLessThanOrEqual(80);
    expect(asked()).toEqual(['rMHark']);
  });

  it('resolves a profile link and a bare handle to the same user', async () => {
    admin();
    const link = await lookup('https://rmhstudios.com/u/@alice');
    const handle = await lookup('@Alice');
    expect(link.json?.results[0]?.id).toBe(alice.id);
    expect(handle.json?.results[0]?.id).toBe(alice.id);
  });

  it('resolves a report id and points at the reported item, but not at a reported message', async () => {
    admin();
    const post = await lookup(CUID(3));
    expect(post.json?.results[0]).toMatchObject({
      kind: 'report',
      relatedQuery: CUID(2),
      adminTool: {
        tool: 'reports',
        status: 'PENDING',
        type: 'rmhark',
      },
    });
    const dm = await lookup(CUID(4));
    expect(dm.json?.results[0]?.relatedQuery).toBeNull();
    expect(h.calls).not.toContain('chatMessage');
  });

  it('resolves a moderator note id to its subject without reading the note text', async () => {
    admin();
    h.tables.moderatorNote = [
      {
        id: CUID(6),
        createdAt: NOW,
        deletedAt: null,
        subjectId: alice.id,
        body: 'private text',
        subject: {
          id: alice.id,
          handle: 'alice',
          name: 'Alice',
        },
      },
    ];
    const { json } = await lookup(CUID(6));
    const note = json?.results.find((r) => r.kind === 'note');
    expect(note).toMatchObject({
      label: '@alice',
      relatedQuery: alice.id,
      adminTool: {
        tool: 'users',
        q: 'alice',
        open: alice.id,
      },
    });
    expect(JSON.stringify(json)).not.toContain('private text');
  });

  it('resolves a bigint to an outbox event and asks nothing else', async () => {
    admin();
    const { json } = await lookup('42');
    expect(json?.results[0]).toMatchObject({
      kind: 'outbox',
      id: '42',
      adminTool: {
        tool: 'outbox',
        topic: 'webhook.post.created',
      },
    });
    expect(json?.results[0]?.states).toEqual([
      {
        state: 'dead',
      },
    ]);
    expect(asked()).toEqual(['outboxEvent']);
  });

  it('marks a private community and gives it no public page', async () => {
    admin();
    const { json } = await lookup('https://rmhstudios.com/c/quiet');
    expect(json?.results[0]).toMatchObject({
      kind: 'community',
      publicPath: null,
    });
    expect(json?.results[0]?.states).toEqual([
      {
        state: 'private',
      },
    ]);
  });
});

describe('s05-10 admin lookup: resolvers run only for matching shapes', () => {
  it('asks only id-keyed kinds for a cuid, and never the outbox', async () => {
    admin();
    await lookup(CUID(77));
    expect(asked()).toEqual(
      [
        'user',
        'rMHark',
        'rMHarkComment',
        'community',
        'event',
        'tournament',
        'userBuild',
        'gameReplay',
        'contentReport',
        'moderatorNote',
      ].sort(),
    );
  });
  it('asks only users for a handle and for an e-mail address', async () => {
    admin();
    await lookup('someone');
    expect(asked()).toEqual(['user']);
    h.calls.length = 0;
    await lookup('nobody@example.com');
    expect(asked()).toEqual(['user']);
  });
  it('reads nothing for a foreign link, an unknown path or junk', async () => {
    admin();
    const foreign = await lookup('https://evil.example/u/alice');
    expect(foreign.json?.outcome).toBe('foreign-link');
    const lookalike = await lookup('https://rmhstudios.com.evil.example/u/alice');
    expect(lookalike.json?.outcome).toBe('foreign-link');
    const unknown = await lookup('https://rmhstudios.com/nowhere/at/all');
    expect(unknown.json?.outcome).toBe('unknown-path');
    const junk = await lookup('what is this?!');
    expect(junk.json?.outcome).toBe('unrecognised');
    expect(h.calls).toEqual([]);
  });
  it('does not query an id-keyed kind with a link segment that is not an id', async () => {
    admin();
    const { json } = await lookup('https://rmhstudios.com/tournaments/not-an-id');
    expect(json?.outcome).toBe('not-found');
    expect(h.calls).toEqual([]);
  });
});

describe('s05-10 admin lookup: private messages', () => {
  it('returns nothing for a message id, says what was tried, and never reads a chat model', async () => {
    admin();
    const { json } = await lookup(CUID(8));
    expect(json?.outcome).toBe('not-found');
    expect(json?.results).toEqual([]);
    expect(json?.tried).not.toContain('chat');
    expect(h.calls).not.toContain('chatMessage');
    expect(h.calls).not.toContain('groupCallMessage');
  });
  it('has no chat or message model anywhere in the lookup code', () => {
    for (const file of ['lookup.server.ts', 'lookup.ts']) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/chatMessage|directMessage|groupMessage|groupCallMessage/i);
    }
  });
});

describe('s05-10 admin lookup: audit', () => {
  it('records an e-mail lookup as the kind and the matched user id, never the address', async () => {
    admin();
    const { json } = await lookup('Alice@Example.com');
    expect(json?.results[0]?.id).toBe(alice.id);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      adminId: 'admin-1',
      action: 'admin.lookup',
      targetType: 'user',
      targetId: alice.id,
      detail: `input=email found=user:${alice.id}`,
    });
    expect(JSON.stringify(h.audits)).not.toMatch(/alice@example|example\.com/i);
  });
  it('matches an e-mail address exactly: a near miss finds nothing', async () => {
    admin();
    const { json } = await lookup('alice@example.co');
    expect(json?.outcome).toBe('not-found');
    expect(JSON.stringify(h.audits)).not.toContain('alice@example');
  });
  it('writes one row per lookup, with no target when nothing or several things matched', async () => {
    admin();
    await lookup(CUID(99));
    expect(h.audits[0]).toMatchObject({
      action: 'admin.lookup',
      targetType: null,
      targetId: null,
    });
    expect(h.audits[0]?.detail).toBe('input=id found=none');
    await lookup('nothing here');
    expect(h.audits).toHaveLength(2);
  });
  it('lists every kind that matches one id', async () => {
    admin();
    h.tables.event = [
      {
        id: alice.id,
        title: 'Meetup',
        createdAt: NOW,
        canceledAt: NOW,
        visibility: 'PUBLIC',
      },
    ];
    const { json } = await lookup(alice.id);
    expect(json?.results.map((r) => r.kind)).toEqual(['user', 'event']);
    expect(json?.results[1]?.states).toEqual([
      {
        state: 'cancelled',
      },
    ]);
    expect(h.audits[0]).toMatchObject({
      targetType: null,
      targetId: null,
    });
    expect(h.audits[0]?.detail).toBe(`input=id found=user:${alice.id},event:${alice.id}`);
  });
});

describe('s05-10 audit log: a target filter', () => {
  it('reads targetId from the query string and filters on it', async () => {
    const { buildAuditWhere, parseAuditFilters } = await import('@/lib/admin/audit-query');
    const f = parseAuditFilters(
      new URLSearchParams({
        targetId: ` ${alice.id} `,
      }),
    );
    expect(f.targetId).toBe(alice.id);
    expect(buildAuditWhere(f)).toEqual({
      targetId: alice.id,
    });
    expect(buildAuditWhere(parseAuditFilters(new URLSearchParams()))).toEqual({});
  });
});
