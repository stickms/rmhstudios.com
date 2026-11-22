/**
 * Password resets in the security log: a request for an existing account and a completed reset each
 * write one row from Better Auth's `sendResetPassword` / `onPasswordReset` options. The request is
 * recorded without being awaited (an existing address must not answer slower than an unknown one), and
 * neither row carries the reset URL or token. The old `/reset-password` hook mapping is gone, so a
 * completed reset is one row, not two.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  recordSecurityEvent: vi.fn(async (_input: unknown) => undefined),
  sendEmail: vi.fn(async (_input: unknown) => undefined),
  startRecoveryHold: vi.fn(async (..._a: unknown[]) => undefined),
  options: null as null | {
    emailAndPassword: {
      sendResetPassword: (
        d: { user: { id: string; email: string }; url: string; token: string },
        r: Request,
      ) => Promise<void>;
      onPasswordReset: (d: { user: { id: string; email: string } }, r: Request) => Promise<void>;
    };
  },
}));

vi.mock('better-auth', () => ({
  betterAuth: (o: typeof h.options) => {
    h.options = o;
    return { api: {} };
  },
}));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: h.recordSecurityEvent }));
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<object>()), sendEmail: h.sendEmail }));
vi.mock('@/lib/prisma.server', () => ({ prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }) }));
vi.mock('@/lib/recovery/hold.server', () => ({ startRecoveryHold: h.startRecoveryHold }));

const user = { id: 'user-1', email: 'a@example.com' };
const request = new Request('https://rmhstudios.com/api/auth/reset-password', { method: 'POST' });

describe('password reset security log', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (!h.options) await import('@/lib/auth');
  });

  it('a reset request writes one row and does not wait for it', async () => {
    let finish: () => void = () => {};
    h.recordSecurityEvent.mockImplementationOnce(() => new Promise<undefined>((r) => (finish = () => r(undefined))));
    await expect(
      h.options!.emailAndPassword.sendResetPassword(
        { user, url: 'https://x.test/reset?token=SECRET', token: 'SECRET' },
        request,
      ),
    ).resolves.toBeUndefined();
    expect(h.recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(h.recordSecurityEvent.mock.calls[0]![0]).toMatchObject({
      userId: 'user-1',
      kind: 'password_reset_requested',
      request,
    });
    finish();
  });

  it('a completed reset writes one row and still starts the recovery hold', async () => {
    await h.options!.emailAndPassword.onPasswordReset({ user }, request);
    expect(h.recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(h.recordSecurityEvent.mock.calls[0]![0]).toMatchObject({
      userId: 'user-1',
      kind: 'password_reset_completed',
      request,
    });
    expect(h.startRecoveryHold).toHaveBeenCalledWith('user-1', 'password reset by email');
  });

  it('neither row carries the reset URL or token', async () => {
    await h.options!.emailAndPassword.sendResetPassword(
      { user, url: 'https://x.test/reset?token=SECRET', token: 'SECRET' },
      request,
    );
    await h.options!.emailAndPassword.onPasswordReset({ user }, request);
    for (const [input] of h.recordSecurityEvent.mock.calls) {
      expect(JSON.stringify(input, (_k, v) => (v instanceof Request ? v.method : v))).not.toContain('SECRET');
      expect(Object.keys(input as object).sort()).toEqual(['kind', 'request', 'userId']);
    }
  });

  it('the hooks no longer map /reset-password, so a reset is not logged twice', () => {
    const src = readFileSync(join(__dirname, '..', 'security-hooks.server.ts'), 'utf8');
    expect(src).not.toMatch(/'\/reset-password':/);
  });
});
