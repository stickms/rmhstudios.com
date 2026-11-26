/**
 * s15-06: the guestbook's two refusals are coded, so the panel can show them in the reader's language. The English
 * of each code is exactly the sentence the route returned before the code existed, the body is `refusalBody(code)`,
 * the status is the one the route used (403, 429), and `readRefusal` honours the body as a refusal of that code.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { readRefusal } from '@/lib/errors/refusal';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  session: vi.fn(),
  profile: null as Row | null,
  follow: null as Row | null,
  block: null as Row | null,
  recent: null as Row | null,
  created: [] as Row[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.session } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/moderation/restrictions.server', () => ({ restrictionResponse: vi.fn(async () => null) }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: vi.fn(async () => []) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      userProfile: { findUnique: vi.fn(async () => h.profile) },
      userBlock: { findFirst: vi.fn(async () => h.block) },
      follow: { findUnique: vi.fn(async () => h.follow) },
      guestbookEntry: {
        findFirst: vi.fn(async () => h.recent),
        create: vi.fn(async ({ data }: { data: Row }) => {
          h.created.push(data);
          return { id: 'new-entry' };
        }),
      },
    }),
  };
});

import { route } from '@/lib/guestbook/api/profile.$id.guestbook.server';
import { signGuestbook } from '@/lib/guestbook/guestbook.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const post = handlersOf<Handler>(route).POST as Handler;

async function sign(owner = 'owner') {
  h.session.mockResolvedValue({ user: { id: 'visitor', isAdmin: false }, session: { id: 's' } });
  return post({
    request: new Request(`https://rmhstudios.com/api/profile/${owner}/guestbook`, {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc', 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Hello' }),
    }),
    params: { id: owner },
  });
}

beforeEach(() => {
  h.profile = { guestbookMode: 'everyone' };
  h.follow = null;
  h.block = null;
  h.recent = null;
  h.created = [];
});

describe('the two codes', () => {
  it('say exactly what the route said before they existed', () => {
    expect(ERROR_CODES.GUESTBOOK_CLOSED.text).toBe('This guestbook is not open to you');
    expect(ERROR_CODES.GUESTBOOK_DAILY_LIMIT.text).toBe('You can sign this guestbook once a day');
    expect(ERROR_CODES.GUESTBOOK_CLOSED.http).toBe(403);
    expect(ERROR_CODES.GUESTBOOK_DAILY_LIMIT.http).toBe(429);
  });

  it('are bodies `refusalBody(code)` that the client reads back as the same code', () => {
    for (const code of ['GUESTBOOK_CLOSED', 'GUESTBOOK_DAILY_LIMIT'] as const) {
      const body = refusalBody(code);
      expect(body).toEqual({ error: ERROR_CODES[code].text, code });
      expect(readRefusal(body)).toEqual({ code, params: {} });
    }
  });
});

describe('signGuestbook', () => {
  it('returns the closed code for a closed guestbook, a blocked visitor and an unfollowed one', async () => {
    h.profile = { guestbookMode: 'off' };
    expect(await signGuestbook('owner', 'visitor', 'Hi')).toEqual({ ok: false, code: 'GUESTBOOK_CLOSED' });
    h.profile = { guestbookMode: 'everyone' };
    h.block = { id: 'b1' };
    expect(await signGuestbook('owner', 'visitor', 'Hi')).toEqual({ ok: false, code: 'GUESTBOOK_CLOSED' });
    h.block = null;
    h.profile = { guestbookMode: 'following' };
    expect(await signGuestbook('owner', 'visitor', 'Hi')).toEqual({ ok: false, code: 'GUESTBOOK_CLOSED' });
    expect(h.created).toEqual([]);
  });

  it('returns the daily-limit code for a second entry within a day, and writes nothing', async () => {
    h.recent = { id: 'earlier' };
    expect(await signGuestbook('owner', 'visitor', 'Hi')).toEqual({ ok: false, code: 'GUESTBOOK_DAILY_LIMIT' });
    expect(h.created).toEqual([]);
  });
});

describe('POST /api/profile/$id/guestbook', () => {
  it('answers a closed guestbook with the coded 403', async () => {
    h.profile = { guestbookMode: 'off' };
    const res = await sign();
    expect(res.status).toBe(403);
    const body = await res.json();
    assertJsonSafe(body);
    expect(body).toEqual(refusalBody('GUESTBOOK_CLOSED'));
  });

  it('answers a second entry in a day with the coded 429', async () => {
    h.recent = { id: 'earlier' };
    const res = await sign();
    expect(res.status).toBe(429);
    const body = await res.json();
    assertJsonSafe(body);
    expect(body).toEqual(refusalBody('GUESTBOOK_DAILY_LIMIT'));
  });

  it('still signs an open guestbook (201)', async () => {
    const res = await sign();
    expect(res.status).toBe(201);
    expect(h.created).toEqual([{ ownerId: 'owner', authorId: 'visitor', body: 'Hello' }]);
  });
});
