/**
 * s03-04 moderator notes, through the real endpoint wrapper with Prisma stood in for: non-admins are
 * refused everywhere, only the author edits and only inside 24 hours, an edit keeps the previous
 * text, at most three notes are pinned, deleted notes lose their text, and every change is audited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Note {
  id: string;
  subjectId: string;
  authorId: string | null;
  body: string;
  editedFrom: string[];
  reportId: string | null;
  strikeId: string | null;
  pinned: boolean;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  notes: [] as Note[],
  audits: [] as {
    adminId: string;
    action: string;
    opts: Record<string, unknown>;
  }[],
  seq: 0,
  users: new Map<
    string,
    {
      id: string;
      banReason: string | null;
    }
  >(),
  reports: [] as {
    id: string;
    targetUserId: string;
  }[],
  strikes: [] as {
    id: string;
    userId: string;
  }[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(async (adminId: string, action: string, opts: Record<string, unknown>) => {
    h.audits.push({
      adminId,
      action,
      opts,
    });
  }),
}));

type Where = {
  id?: string;
  subjectId?: string;
  deletedAt?: null;
  pinned?: boolean;
  body?: {
    contains: string;
  };
};
const matches = (n: Note, w: Where) =>
  (w.id === undefined || n.id === w.id) &&
  (w.subjectId === undefined || n.subjectId === w.subjectId) &&
  (w.deletedAt === undefined || n.deletedAt === null) &&
  (w.pinned === undefined || n.pinned === w.pinned) &&
  (w.body === undefined || n.body.toLowerCase().includes(w.body.contains.toLowerCase()));
const withAuthor = (n: Note) => ({
  ...n,
  author: n.authorId
    ? {
        id: n.authorId,
        name: n.authorId,
        image: null,
        handle: n.authorId,
        profile: null,
        inventory: [],
      }
    : null,
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
          };
        }) => h.users.get(where.id) ?? null,
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: {
              in: string[];
            };
          };
        }) =>
          where.id.in.map((id) => ({
            id,
            name: id,
            image: null,
            handle: id,
            profile: null,
            inventory: [],
          })),
      ),
    },
    contentReport: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            targetUserId: string;
          };
        }) => h.reports.find((r) => r.id === where.id && r.targetUserId === where.targetUserId) ?? null,
      ),
      findMany: vi.fn(async () => []),
    },
    userStrike: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            userId: string;
          };
        }) => h.strikes.find((s) => s.id === where.id && s.userId === where.userId) ?? null,
      ),
      findMany: vi.fn(async () => []),
    },
    moderatorNote: {
      create: vi.fn(async ({ data }: { data: Partial<Note> }) => {
        const now = new Date();
        const note: Note = {
          id: `n${++h.seq}`,
          subjectId: data.subjectId!,
          authorId: data.authorId ?? null,
          body: data.body!,
          editedFrom: [],
          reportId: data.reportId ?? null,
          strikeId: data.strikeId ?? null,
          pinned: false,
          deletedAt: null,
          deletedById: null,
          createdAt: now,
          updatedAt: now,
        };
        h.notes.push(note);
        return withAuthor(note);
      }),
      findFirst: vi.fn(async ({ where }: { where: Where }) => {
        const n = h.notes.find((x) => matches(x, where));
        return n ? withAuthor(n) : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) =>
        h.notes
          .filter((n) => matches(n, where))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.getTime() - a.createdAt.getTime())
          .map(withAuthor),
      ),
      count: vi.fn(async ({ where }: { where: Where }) => h.notes.filter((n) => matches(n, where)).length),
      groupBy: vi.fn(
        async ({
          where,
        }: {
          where: {
            subjectId: {
              in: string[];
            };
            deletedAt: null;
          };
        }) => {
          const counts = new Map<string, number>();
          for (const n of h.notes) {
            if (where.subjectId.in.includes(n.subjectId) && n.deletedAt === null) {
              counts.set(n.subjectId, (counts.get(n.subjectId) ?? 0) + 1);
            }
          }
          return [...counts].map(([subjectId, c]) => ({
            subjectId,
            _count: {
              _all: c,
            },
          }));
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
          };
          data: Partial<Note> & {
            editedFrom?: {
              push: string;
            };
          };
        }) => {
          const n = h.notes.find((x) => x.id === where.id)!;
          const { editedFrom, ...rest } = data;
          Object.assign(n, rest);
          if (editedFrom) n.editedFrom = [...n.editedFrom, editedFrom.push];
          return withAuthor(n);
        },
      ),
    },
  },
}));

import { route as listRoute } from '@/lib/moderation/api/admin.users.$id.notes.server';
import { noteCountsFor } from '@/lib/moderation/notes.server';
import { route as itemRoute } from '@/lib/moderation/api/admin.users.$id.notes.$noteId.server';

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;
const call = (
  route: {
    handlers: unknown;
  },
  method: string,
  params: Record<string, string>,
  body?: unknown,
  url = '/api/admin/users/m1/notes',
) =>
  (route.handlers as Handlers)[method]!({
    request: new Request(`https://rmhstudios.com${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    }),
    params,
  });

const ADMIN_A = {
  user: {
    id: 'adminA',
    isAdmin: true,
  },
};
const ADMIN_B = {
  user: {
    id: 'adminB',
    isAdmin: true,
  },
};
const MEMBER = {
  user: {
    id: 'u9',
    isAdmin: false,
  },
};
const HOUR = 3_600_000;

const addNote = async (body = 'Warned in DMs about spam links') => {
  const res = await call(
    listRoute,
    'POST',
    {
      id: 'm1',
    },
    {
      body,
    },
  );
  return (await res.json()).note as {
    id: string;
  };
};

beforeEach(() => {
  h.session = ADMIN_A;
  h.notes = [];
  h.audits = [];
  h.seq = 0;
  h.users = new Map([
    [
      'm1',
      {
        id: 'm1',
        banReason: null,
      },
    ],
    [
      'gone',
      {
        id: 'gone',
        banReason: 'account_deleted',
      },
    ],
  ]);
  h.reports = [
    {
      id: 'r1',
      targetUserId: 'm1',
    },
    {
      id: 'r2',
      targetUserId: 'someone-else',
    },
  ];
  h.strikes = [
    {
      id: 's1',
      userId: 'm1',
    },
  ];
});

describe('moderator notes: access', () => {
  it('refuses a non-admin on every endpoint', async () => {
    h.session = MEMBER;
    const note = {
      id: 'm1',
      noteId: 'n1',
    };
    const results = await Promise.all([
      call(listRoute, 'GET', {
        id: 'm1',
      }),
      call(
        listRoute,
        'POST',
        {
          id: 'm1',
        },
        {
          body: 'x',
        },
      ),
      call(itemRoute, 'PATCH', note, {
        pinned: true,
      }),
      call(itemRoute, 'DELETE', note),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    expect(h.notes).toEqual([]);
  });

  it('refuses a signed-out caller', async () => {
    h.session = null;
    expect(
      (
        await call(listRoute, 'GET', {
          id: 'm1',
        })
      ).status,
    ).toBe(401);
  });

  it('404s for a member that does not exist and 404s for an erased one', async () => {
    expect(
      (
        await call(listRoute, 'GET', {
          id: 'nobody',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            id: 'gone',
          },
          {
            body: 'x',
          },
        )
      ).status,
    ).toBe(404);
  });
});

describe('moderator notes: create and read', () => {
  it('shows a note to another admin with its author, pinned first', async () => {
    const a = await addNote('first');
    await addNote('second');
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: a.id,
      },
      {
        pinned: true,
      },
    );
    h.session = ADMIN_B;
    const page = await (
      await call(listRoute, 'GET', {
        id: 'm1',
      })
    ).json();
    expect(page.notes.map((n: { body: string }) => n.body)).toEqual(['first', 'second']);
    expect(page.notes[0].author.id).toBe('adminA');
    expect(page.total).toBe(2);
    expect(page.pinned).toBe(1);
  });

  it('rejects empty and over-long text', async () => {
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            id: 'm1',
          },
          {
            body: '   ',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            id: 'm1',
          },
          {
            body: 'x'.repeat(2001),
          },
        )
      ).status,
    ).toBe(400);
  });

  it('links only to the member’s own report or strike', async () => {
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            id: 'm1',
          },
          {
            body: 'x',
            reportId: 'r2',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          listRoute,
          'POST',
          {
            id: 'm1',
          },
          {
            body: 'x',
            strikeId: 'nope',
          },
        )
      ).status,
    ).toBe(400);
    const ok = await call(
      listRoute,
      'POST',
      {
        id: 'm1',
      },
      {
        body: 'x',
        reportId: 'r1',
        strikeId: 's1',
      },
    );
    expect(ok.status).toBe(201);
    expect(h.notes[0]).toMatchObject({
      reportId: 'r1',
      strikeId: 's1',
    });
  });

  it('searches the text of live notes within the member', async () => {
    await addNote('Spam links in DMs');
    const gone = await addNote('Spam again');
    await addNote('Handle change confirmed');
    await call(itemRoute, 'DELETE', {
      id: 'm1',
      noteId: gone.id,
    });
    const page = await (
      await call(
        listRoute,
        'GET',
        {
          id: 'm1',
        },
        undefined,
        '/api/admin/users/m1/notes?q=spam',
      )
    ).json();
    expect(page.notes.map((n: { body: string }) => n.body)).toEqual(['Spam links in DMs']);
  });
});

describe('moderator notes: edit', () => {
  it('keeps the previous text and marks the note edited', async () => {
    const n = await addNote('v1');
    const res = await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'v2',
      },
    );
    expect(res.status).toBe(200);
    expect(h.notes[0]).toMatchObject({
      body: 'v2',
      editedFrom: ['v1'],
    });
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'v3',
      },
    );
    expect(h.notes[0]!.editedFrom).toEqual(['v1', 'v2']);
  });

  it('refuses an edit by another admin', async () => {
    const n = await addNote('v1');
    h.session = ADMIN_B;
    const res = await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'rewritten',
      },
    );
    expect(res.status).toBe(403);
    expect(h.notes[0]).toMatchObject({
      body: 'v1',
      editedFrom: [],
    });
  });

  it('refuses an edit after 24 hours', async () => {
    const n = await addNote('v1');
    h.notes[0]!.createdAt = new Date(Date.now() - 25 * HOUR);
    const res = await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'late',
      },
    );
    expect(res.status).toBe(409);
    expect(h.notes[0]!.body).toBe('v1');
  });

  it('lets any admin pin after the edit window closed', async () => {
    const n = await addNote('v1');
    h.notes[0]!.createdAt = new Date(Date.now() - 48 * HOUR);
    h.session = ADMIN_B;
    expect(
      (
        await call(
          itemRoute,
          'PATCH',
          {
            id: 'm1',
            noteId: n.id,
          },
          {
            pinned: true,
          },
        )
      ).status,
    ).toBe(200);
    expect(h.notes[0]!.pinned).toBe(true);
  });

  it('404s a note that belongs to another member', async () => {
    const n = await addNote('v1');
    expect(
      (
        await call(
          itemRoute,
          'PATCH',
          {
            id: 'other',
            noteId: n.id,
          },
          {
            pinned: true,
          },
        )
      ).status,
    ).toBe(404);
  });
});

describe('moderator notes: pins', () => {
  it('refuses the fourth pin and frees a slot on unpin or delete', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await addNote(`note ${i}`)).id);
    for (const id of ids.slice(0, 3)) {
      expect(
        (
          await call(
            itemRoute,
            'PATCH',
            {
              id: 'm1',
              noteId: id,
            },
            {
              pinned: true,
            },
          )
        ).status,
      ).toBe(200);
    }
    const fourth = await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: ids[3]!,
      },
      {
        pinned: true,
      },
    );
    expect(fourth.status).toBe(409);
    expect(h.notes[3]!.pinned).toBe(false);

    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: ids[0]!,
      },
      {
        pinned: false,
      },
    );
    expect(
      (
        await call(
          itemRoute,
          'PATCH',
          {
            id: 'm1',
            noteId: ids[3]!,
          },
          {
            pinned: true,
          },
        )
      ).status,
    ).toBe(200);

    await call(itemRoute, 'DELETE', {
      id: 'm1',
      noteId: ids[1]!,
    });
    expect(h.notes[1]).toMatchObject({
      pinned: false,
    });
  });
});

describe('moderator notes: delete', () => {
  it('soft deletes for any admin and hides the text from the list', async () => {
    const n = await addNote('secret context');
    h.session = ADMIN_B;
    expect(
      (
        await call(itemRoute, 'DELETE', {
          id: 'm1',
          noteId: n.id,
        })
      ).status,
    ).toBe(200);
    expect(h.notes[0]).toMatchObject({
      deletedById: 'adminB',
      body: 'secret context',
    });
    const page = await (
      await call(listRoute, 'GET', {
        id: 'm1',
      })
    ).json();
    expect(page.notes[0]).toMatchObject({
      body: null,
      editedFrom: [],
      deleted: {
        by: {
          id: 'adminB',
        },
      },
    });
    expect(page.total).toBe(0);
    expect(
      (
        await call(itemRoute, 'DELETE', {
          id: 'm1',
          noteId: n.id,
        })
      ).status,
    ).toBe(409);
  });

  it('cannot edit or pin a deleted note', async () => {
    const n = await addNote('v1');
    await call(itemRoute, 'DELETE', {
      id: 'm1',
      noteId: n.id,
    });
    expect(
      (
        await call(
          itemRoute,
          'PATCH',
          {
            id: 'm1',
            noteId: n.id,
          },
          {
            body: 'v2',
          },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          itemRoute,
          'PATCH',
          {
            id: 'm1',
            noteId: n.id,
          },
          {
            pinned: true,
          },
        )
      ).status,
    ).toBe(409);
  });
});

describe('moderator notes: audit', () => {
  it('writes one audit row per change, naming the member and the note and never the text', async () => {
    const n = await addNote('private words');
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'other words',
      },
    );
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        pinned: true,
      },
    );
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        pinned: false,
      },
    );
    await call(itemRoute, 'DELETE', {
      id: 'm1',
      noteId: n.id,
    });
    expect(h.audits.map((a) => a.action)).toEqual([
      'user.note.create',
      'user.note.edit',
      'user.note.pin',
      'user.note.unpin',
      'user.note.delete',
    ]);
    for (const a of h.audits) {
      expect(a.adminId).toBe('adminA');
      expect(a.opts).toEqual({
        targetType: 'user',
        targetId: 'm1',
        detail: `note ${n.id}`,
      });
    }
  });

  it('writes none for a refused change', async () => {
    const n = await addNote('v1');
    h.audits = [];
    h.session = ADMIN_B;
    await call(
      itemRoute,
      'PATCH',
      {
        id: 'm1',
        noteId: n.id,
      },
      {
        body: 'x',
      },
    );
    expect(h.audits).toEqual([]);
  });
});

describe('moderator notes: queue counts', () => {
  it('counts live notes per member in one query and skips deleted ones', async () => {
    await addNote('one');
    const two = await addNote('two');
    await call(itemRoute, 'DELETE', {
      id: 'm1',
      noteId: two.id,
    });
    const counts = await noteCountsFor(['m1', 'm2', 'm1']);
    expect(counts.get('m1')).toBe(1);
    expect(counts.has('m2')).toBe(false);
    expect((await noteCountsFor([])).size).toBe(0);
  });
});
