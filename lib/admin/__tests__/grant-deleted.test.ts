/**
 * A deleted account is a tombstone: `/admin/users` hides the grant button on its row, and the grant endpoint refuses it
 * with GONE (410), for a grant and a revoke alike. A live account is granted as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  users: [] as { id: string; banReason: string | null }[],
  grants: [] as unknown[],
  audits: [] as string[],
  notices: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(async (_admin: string, action: string) => {
    h.audits.push(action);
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/entitlements', () => ({ invalidateUserTier: vi.fn() }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (a: { where: { id: string } }) => h.users.find((u) => u.id === a.where.id) ?? null),
    },
    giftMembership: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (a: unknown) => {
        h.grants.push(a);
      }),
      update: vi.fn(),
    },
  },
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function grant(id: string, body: unknown) {
  const mod = await import('@/lib/admin/api/admin.users.$id.grant-membership.server');
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers.POST!({
    request: new Request(`https://rmhstudios.com/api/admin/users/${id}/grant-membership`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
    params: { id },
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

beforeEach(() => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
  h.users = [
    { id: 'live', banReason: null },
    { id: 'gone', banReason: DELETED_ACCOUNT_BAN_REASON },
    { id: DELETED_USER_ID, banReason: null },
  ];
  h.grants = [];
  h.audits = [];
  h.notices = [];
});

describe('grant membership on a deleted account', () => {
  it('refuses a tombstone with GONE, grants nothing and audits nothing', async () => {
    for (const id of ['gone', DELETED_USER_ID]) {
      const out = await grant(id, { tier: 'pro', months: 1 });
      expect(out.status).toBe(410);
      expect(out.json).toMatchObject({ code: 'GONE' });
    }
    expect(h.grants).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it('refuses a revoke on a tombstone too', async () => {
    expect((await grant('gone', { revoke: true })).status).toBe(410);
    expect(h.audits).toEqual([]);
  });

  it('still grants a live account', async () => {
    expect((await grant('live', { tier: 'pro', months: 1 })).status).toBe(200);
    expect(h.grants).toHaveLength(1);
    expect(h.audits).toEqual(['membership.grant']);
  });

  it('still answers 404 for an account that does not exist', async () => {
    expect((await grant('nobody', { tier: 'pro', months: 1 })).status).toBe(404);
  });
});

describe('the users list and its row', () => {
  it('marks a tombstone as deleted without sending its ban reason, and the page hides the grant button for it', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..', '..', '..');
    const list = readFileSync(join(root, 'lib/admin/api/admin.users.server.ts'), 'utf8');
    expect(list).toMatch(/deleted: isDeletedAccount\(/);
    expect(list).toMatch(/\(\{ banReason, \.\.\.u \}\)/);
    const page = readFileSync(join(root, 'app/routes/_site/admin/users.tsx'), 'utf8');
    expect(page).toMatch(/\{!user\.deleted && <IconButton icon=\{Crown\}/);
  });
});
