/**
 * Secure a member's account, through the real endpoint wrapper with Prisma stood in for: non-admins,
 * admin targets and self are refused; each chosen group is revoked and unchosen ones are not touched;
 * webhook secrets are replaced; the audit entry, note and security event share one transaction; the
 * member's notice omits the reason; a second run reports zeros.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    session: null as {
      user: {
        id: string;
        isAdmin: boolean;
      };
    } | null,
    users: new Map<
      string,
      {
        id: string;
        isAdmin: boolean;
        banReason: string | null;
      }
    >(),
    log: [] as string[],
    inTx: false,
    sessions: 0,
    apiKeys: 0,
    codeTokens: 0,
    endpoints: [] as {
      id: string;
      enabled: boolean;
      secret: string;
      previousSecret: string | null;
    }[],
    feed: null as {
      token: string;
    } | null,
    dispatched: [] as Record<string, unknown>[],
    emails: [] as Record<string, unknown>[],
    notes: [] as Record<string, unknown>[],
    events: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    verificationWhere: null as Record<string, unknown> | null,
    pushWhere: null as Record<string, unknown> | null,
  };
  return state;
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));
vi.mock('@/lib/notify/dispatch.server', () => ({
  dispatch: vi.fn(async (i: Record<string, unknown>) => {
    h.dispatched.push(i);
  }),
}));
vi.mock('@/lib/email/deliveries.server', () => ({
  sendOnce: vi.fn(async (i: Record<string, unknown>) => {
    h.emails.push(i);
    return 'sent';
  }),
}));
vi.mock('@/lib/email/preferences.server', () => ({
  canEmail: vi.fn(async () => true),
}));

const note = (s: string) => {
  if (!h.inTx) throw new Error(`${s} outside the transaction`);
  h.log.push(s);
};

const tx = {
  session: {
    deleteMany: vi.fn(async () => {
      note('sessions');
      const count = h.sessions;
      h.sessions = 0;
      return {
        count,
      };
    }),
  },
  verification: {
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      note('verification');
      h.verificationWhere = where;
      return {
        count: 0,
      };
    }),
  },
  pushSubscription: {
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      note('push');
      h.pushWhere = where;
      return {
        count: 2,
      };
    }),
  },
  developerApiKey: {
    updateMany: vi.fn(async () => {
      note('apiKeys');
      const count = h.apiKeys;
      h.apiKeys = 0;
      return {
        count,
      };
    }),
  },
  rmhCodeToken: {
    updateMany: vi.fn(async () => {
      note('codeTokens');
      const count = h.codeTokens;
      h.codeTokens = 0;
      return {
        count,
      };
    }),
  },
  webhookEndpoint: {
    findMany: vi.fn(async () =>
      h.endpoints.map((e) => ({
        id: e.id,
        enabled: e.enabled,
      })),
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: {
          enabled: boolean;
          secret: string;
          previousSecret: null;
        };
      }) => {
        note('webhook');
        const e = h.endpoints.find((x) => x.id === where.id)!;
        e.enabled = data.enabled;
        e.secret = data.secret;
        e.previousSecret = data.previousSecret;
        return e;
      },
    ),
  },
  calendarFeed: {
    updateMany: vi.fn(
      async ({
        data,
      }: {
        data: {
          token: string;
        };
      }) => {
        note('calendar');
        if (!h.feed)
          return {
            count: 0,
          };
        h.feed.token = data.token;
        return {
          count: 1,
        };
      },
    ),
  },
  adminAuditLog: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      note('audit');
      h.audits.push(data);
    }),
  },
  moderatorNote: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      note('note');
      h.notes.push(data);
    }),
  },
  securityEvent: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      note('securityEvent');
      h.events.push(data);
    }),
  },
};

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
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      h.inTx = true;
      try {
        return await fn(tx);
      } finally {
        h.inTx = false;
      }
    }),
  },
}));

import { route } from '@/lib/admin/api/admin.users.$id.secure.server';

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;
const post = (id: string, body: unknown) =>
  (route.handlers as Handlers).POST!({
    request: new Request(`https://rmhstudios.com/api/admin/users/${id}/secure`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
    params: {
      id,
    },
  });

const ALL = ['sessions', 'tokens', 'webhooks', 'calendar'];
const REASON = 'Report 4411: attacker in DMs';

beforeEach(() => {
  h.session = {
    user: {
      id: 'admin1',
      isAdmin: true,
    },
  };
  h.users.clear();
  h.users.set('admin1', {
    id: 'admin1',
    isAdmin: true,
    banReason: null,
  });
  h.users.set('m1', {
    id: 'm1',
    isAdmin: false,
    banReason: null,
  });
  h.users.set('admin2', {
    id: 'admin2',
    isAdmin: true,
    banReason: null,
  });
  h.log = [];
  h.sessions = 3;
  h.apiKeys = 2;
  h.codeTokens = 1;
  h.endpoints = [
    {
      id: 'w1',
      enabled: true,
      secret: 'whsec_old1',
      previousSecret: 'whsec_prev',
    },
    {
      id: 'w2',
      enabled: false,
      secret: 'whsec_old2',
      previousSecret: null,
    },
  ];
  h.feed = {
    token: 'oldtoken',
  };
  h.dispatched = [];
  h.emails = [];
  h.notes = [];
  h.events = [];
  h.audits = [];
  h.verificationWhere = null;
  h.pushWhere = null;
});

describe('secure account: who may run it', () => {
  it('refuses a non-admin', async () => {
    h.session = {
      user: {
        id: 'u9',
        isAdmin: false,
      },
    };
    expect(
      (
        await post('m1', {
          groups: ALL,
          reason: REASON,
        })
      ).status,
    ).toBe(403);
    expect(h.log).toEqual([]);
  });

  it('refuses an admin target with 403', async () => {
    expect(
      (
        await post('admin2', {
          groups: ALL,
          reason: REASON,
        })
      ).status,
    ).toBe(403);
    expect(h.log).toEqual([]);
  });

  it('refuses the actor themselves with 400', async () => {
    expect(
      (
        await post('admin1', {
          groups: ALL,
          reason: REASON,
        })
      ).status,
    ).toBe(400);
  });

  it('refuses an empty reason or no groups', async () => {
    expect(
      (
        await post('m1', {
          groups: ALL,
          reason: '   ',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('m1', {
          groups: [],
          reason: REASON,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('m1', {
          groups: ALL,
          reason: 'x'.repeat(501),
        })
      ).status,
    ).toBe(400);
  });
});

describe('secure account: what it revokes', () => {
  it('revokes every group, replaces webhook secrets and never returns them', async () => {
    const res = await post('m1', {
      groups: ALL,
      reason: REASON,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sessions: 3,
      apiKeys: 2,
      rmhCodeTokens: 1,
      webhooks: 1,
      calendarRotated: true,
    });
    expect(JSON.stringify(body)).not.toContain('whsec_');
    for (const e of h.endpoints) {
      expect(e.enabled).toBe(false);
      expect(e.secret).toMatch(/^whsec_/);
      expect(e.previousSecret).toBeNull();
    }
    expect(h.endpoints.map((e) => e.secret)).not.toContain('whsec_old1');
    expect(h.endpoints.map((e) => e.secret)).not.toContain('whsec_old2');
    expect(h.feed?.token).not.toBe('oldtoken');
    expect(h.verificationWhere).toEqual({
      value: 'm1',
    });
    // A compromised device stops receiving the member's pushes.
    expect(h.pushWhere).toEqual({
      userId: 'm1',
    });
  });

  it('leaves unchosen groups untouched', async () => {
    const res = await post('m1', {
      groups: ['tokens'],
      reason: REASON,
    });
    expect(res.status).toBe(200);
    expect(h.log).toContain('apiKeys');
    expect(h.log).toContain('codeTokens');
    for (const untouched of ['sessions', 'verification', 'push', 'webhook', 'calendar']) {
      expect(h.log).not.toContain(untouched);
    }
    expect(h.sessions).toBe(3);
    expect(h.endpoints[0]!.enabled).toBe(true);
    expect(h.feed?.token).toBe('oldtoken');
  });

  it('never bans or removes sign-in methods', async () => {
    await post('m1', {
      groups: ALL,
      reason: REASON,
    });
    expect(h.users.get('m1')!.banReason).toBeNull();
    expect(h.log.every((s) => !/passkey|account|ban/i.test(s))).toBe(true);
  });

  it('writes the audit entry, note and security event in the same transaction, after the revocations', async () => {
    await post('m1', {
      groups: ALL,
      reason: REASON,
    });
    expect(h.log.slice(-3)).toEqual(['audit', 'note', 'securityEvent']);
    expect(h.audits[0]).toMatchObject({
      adminId: 'admin1',
      action: 'user.secure_account',
      targetId: 'm1',
      detail: REASON,
    });
    expect(h.notes[0]).toMatchObject({
      subjectId: 'm1',
      authorId: 'admin1',
    });
    expect(String(h.notes[0]!.body)).toContain(REASON);
    expect(h.events[0]).toMatchObject({
      userId: 'm1',
      kind: 'account_secured_by_admin',
    });
  });

  it('tells the member without the reason', async () => {
    await post('m1', {
      groups: ALL,
      reason: REASON,
    });
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]).toMatchObject({
      userId: 'm1',
      type: 'SYSTEM',
      entityType: 'account_secured',
      urgency: 'critical',
      link: '/settings/security',
    });
    expect(JSON.stringify(h.dispatched)).not.toContain('4411');
    expect(JSON.stringify(h.emails)).not.toContain('4411');
  });

  it('a second run reports zeros', async () => {
    await post('m1', {
      groups: ALL,
      reason: REASON,
    });
    const body = await (
      await post('m1', {
        groups: ALL,
        reason: REASON,
      })
    ).json();
    expect(body).toMatchObject({
      sessions: 0,
      apiKeys: 0,
      rmhCodeTokens: 0,
      webhooks: 0,
    });
  });
});
