/**
 * s10-18: the admin rename goes through `changeHandle` too, so it leaves a `HandleChange` row and cannot take
 * a name somebody released in the last 30 days (the admin skips only the rename cooldown).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface UserRow {
  id: string;
  handle: string | null;
  handleChangedAt: Date | null;
  isAdmin: boolean;
}
interface ChangeRow {
  userId: string;
  oldHandle: string;
  newHandle: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({ users: [] as UserRow[], changes: [] as ChangeRow[] }));

function makeDb() {
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; handle?: string } }) => {
        const row = h.users.find((u) => (where.id ? u.id === where.id : u.handle === where.handle));
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = h.users.find((u) => u.id === where.id);
        if (row) Object.assign(row, data);
        return { ...row };
      }),
    },
    handleChange: {
      findMany: vi.fn(async ({ where }: { where: { oldHandle?: string } }) =>
        h.changes.filter((c) => c.oldHandle === where.oldHandle).map((c) => ({ ...c })),
      ),
      create: vi.fn(async ({ data }: { data: Omit<ChangeRow, 'createdAt'> }) => {
        h.changes.push({ ...data, createdAt: new Date() });
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return db;
}

vi.mock('@/lib/prisma.server', () => ({ prisma: makeDb() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'admin', isAdmin: true } })) } },
}));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/user-display.server', () => ({ invalidateUserDisplay: vi.fn() }));
vi.mock('@/lib/profile.server', () => ({ invalidateProfileLookup: vi.fn() }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/rate-limit.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit.server')>()),
  withRateLimitAsync: vi.fn(async () => null),
}));

import { route } from '@/lib/admin/api/admin.users.server';

let n = 0;
async function patch(body: Record<string, unknown>) {
  n += 1;
  const request = new Request('http://localhost/api/admin/users', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=test-1',
      'x-forwarded-for': `10.1.0.${n}`,
    },
    body: JSON.stringify(body),
  });
  const handler = route.handlers.PATCH;
  if (!handler) throw new Error('no PATCH handler');
  return handler({ request, params: {} });
}

beforeEach(() => {
  h.changes = [];
  h.users = [
    { id: 'admin', handle: 'boss', handleChangedAt: null, isAdmin: true },
    { id: 'u1', handle: 'alice', handleChangedAt: new Date(), isAdmin: false },
    { id: 'u2', handle: 'bob', handleChangedAt: null, isAdmin: false },
  ];
});

describe('PATCH /api/admin/users handle rename', () => {
  it('records a HandleChange row and skips the rename cooldown', async () => {
    const res = await patch({ userId: 'u1', handle: 'alice_two' });
    expect(res.status).toBe(200);
    expect(h.users.find((u) => u.id === 'u1')?.handle).toBe('alice_two');
    expect(h.changes).toEqual([expect.objectContaining({ oldHandle: 'alice', newHandle: 'alice_two' })]);
  });

  it('refuses a name released in the last 30 days', async () => {
    h.changes.push({ userId: 'u2', oldHandle: 'carol', newHandle: 'bob', createdAt: new Date() });
    const res = await patch({ userId: 'u1', handle: 'carol' });
    expect(res.status).toBe(409);
    expect(h.users.find((u) => u.id === 'u1')?.handle).toBe('alice');
  });

  it('refuses a taken name', async () => {
    const res = await patch({ userId: 'u1', handle: 'bob' });
    expect(res.status).toBe(409);
  });
});
