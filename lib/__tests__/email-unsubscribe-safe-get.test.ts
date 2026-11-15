/**
 * The digest's unsubscribe link must not unsubscribe on a GET (redesign audit C2).
 *
 * Mail security scanners, link previewers and prefetchers fetch every link in a
 * message. When the GET did the write, any of them unsubscribed the reader. The
 * GET now only shows a confirmation; the write is a POST, which is also what
 * RFC 8058 one-click unsubscribe sends (the digest advertises
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsert, invalidate, verify } = vi.hoisted(() => ({
  upsert: vi.fn(),
  invalidate: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: { notificationPreference: { upsert } } }));
vi.mock('@/lib/notifications.server', () => ({ invalidateNotificationPrefs: invalidate }));
vi.mock('@/lib/email/unsubscribe', () => ({ verifyUnsubToken: verify }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (cfg: unknown) => ({ options: cfg }),
}));

import { Route } from '../../app/routes/api/email/unsubscribe';

type Handler = (a: { request: Request }) => Promise<Response>;
const { GET, POST } = (
  Route as unknown as { options: { server: { handlers: { GET: Handler; POST: Handler } } } }
).options.server.handlers;

let ip = 0;
const req = (method: 'GET' | 'POST', token = 'tok') =>
  new Request(`https://rmhstudios.com/api/email/unsubscribe?token=${token}`, {
    method,
    headers: { 'cf-connecting-ip': `10.9.0.${ip++ % 250}` },
    ...(method === 'POST'
      ? {
          body: 'List-Unsubscribe=One-Click',
          headers: {
            'cf-connecting-ip': `10.9.1.${ip++ % 250}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
        }
      : {}),
  });

describe('email unsubscribe: GET is safe, POST writes', () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({});
    invalidate.mockReset();
    verify.mockReset().mockReturnValue('user-1');
  });

  it('GET with a valid token shows a confirmation form and writes nothing', async () => {
    const res = await GET({ request: req('GET') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain('/api/email/unsubscribe?token=tok');
    expect(upsert).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('POST (one-click or the confirmation button) unsubscribes', async () => {
    const res = await POST({ request: req('POST') });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', emailDigest: false },
      update: { emailDigest: false },
    });
    expect(invalidate).toHaveBeenCalledWith('user-1');
  });

  it('an invalid token writes nothing on either method', async () => {
    verify.mockReturnValue(null);
    expect((await GET({ request: req('GET', 'bad') })).status).toBe(200);
    expect((await POST({ request: req('POST', 'bad') })).status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
