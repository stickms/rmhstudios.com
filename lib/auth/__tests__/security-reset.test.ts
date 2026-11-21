/**
 * A password reset from the "forgot password" form is a security event like a
 * password change, but it is made signed out: the account is the one the reset
 * token names. The token is deleted by the endpoint, so the `before` hook must
 * resolve it, and an invalid or expired token must record nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordSecurityEvent = vi.fn(async (_input: unknown) => undefined);
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent }));

const { captureSecurityActor, recordSecurityAfter } = await import('@/lib/auth/security-hooks.server');

function ctxFor(token: string, verification: { value: string; expiresAt: Date } | null, returned?: unknown) {
  const findVerificationValue = vi.fn(async (id: string) => (id === `reset-password:${token}` ? verification : null));
  return {
    path: '/reset-password',
    request: new Request('https://rmhstudios.com/api/auth/reset-password', { method: 'POST' }),
    body: { token, newPassword: 'a-new-password' },
    query: {},
    context: { internalAdapter: { findVerificationValue }, returned },
  } as never;
}

describe('security log: password reset', () => {
  beforeEach(() => recordSecurityEvent.mockClear());

  it('records password_changed for the account the reset token belongs to, with no session', async () => {
    const ctx = ctxFor('tok', { value: 'user-1', expiresAt: new Date(Date.now() + 60_000) });
    await captureSecurityActor(ctx);
    await recordSecurityAfter(ctx);
    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(recordSecurityEvent.mock.calls[0]![0]).toMatchObject({ userId: 'user-1', kind: 'password_changed', sessionId: null });
  });

  it('records nothing for an expired token or a failed reset', async () => {
    const expired = ctxFor('old', { value: 'user-1', expiresAt: new Date(Date.now() - 1) });
    await captureSecurityActor(expired);
    await recordSecurityAfter(expired);
    const failed = ctxFor('tok', { value: 'user-1', expiresAt: new Date(Date.now() + 60_000) }, new Error('INVALID_TOKEN'));
    await captureSecurityActor(failed);
    await recordSecurityAfter(failed);
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });
});
