/**
 * Sign-in side effects wait for the second factor (`lib/auth/two-factor.server.ts`). A correct password
 * with 2FA on is not a sign-in: the new-device alert, the security log row and cancelling a scheduled
 * deletion must not run until the code is accepted. Enabling or disabling 2FA replaces the session
 * without anyone signing in, and a code confirmed during setup is not a sign-in either.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TWO_FACTOR_OPTIONS,
  classifyNewSession,
  completedPasswordSignIn,
  noteTwoFactorVerifier,
} from '@/lib/auth/two-factor.server';

type Ctx = Parameters<typeof completedPasswordSignIn>[0];

function ctx(over: {
  path: string;
  request?: Request;
  newSession?: unknown;
  sessionCookie?: string | null;
  sessionFound?: boolean;
  requiresTwoFactor?: boolean | null;
}): Ctx {
  const plugin =
    over.requiresTwoFactor === null ? null : { shouldRequireTwoFactor: vi.fn(async () => !!over.requiresTwoFactor) };
  return {
    path: over.path,
    request: over.request,
    getSignedCookie: vi.fn(async () => over.sessionCookie ?? null),
    context: {
      newSession: over.newSession,
      secret: 's',
      authCookies: { sessionToken: { name: 'session_token' } },
      internalAdapter: { findSession: vi.fn(async () => (over.sessionFound ? { session: {} } : null)) },
      getPlugin: vi.fn(() => plugin),
    },
  } as unknown as Ctx;
}

const session = { id: 'sess-1', userId: 'user-1' };

describe('classifyNewSession', () => {
  it('defers a password sign-in to the after-hook', () => {
    expect(classifyNewSession('/sign-in/email', new Request('https://x.test'))).toBe('deferred');
  });

  it('does not count enabling or disabling 2FA as a sign-in', () => {
    expect(classifyNewSession('/two-factor/enable', new Request('https://x.test'))).toBe('not-a-sign-in');
    expect(classifyNewSession('/two-factor/disable', new Request('https://x.test'))).toBe('not-a-sign-in');
  });

  it('counts a code that finishes a sign-in, but not one confirming setup', async () => {
    const signingIn = new Request('https://x.test/api/auth/two-factor/verify-totp', { method: 'POST' });
    await noteTwoFactorVerifier(ctx({ path: '/two-factor/verify-totp', request: signingIn }));
    expect(classifyNewSession('/two-factor/verify-totp', signingIn)).toBe('sign-in');

    const settingUp = new Request('https://x.test/api/auth/two-factor/verify-totp', { method: 'POST' });
    await noteTwoFactorVerifier(
      ctx({ path: '/two-factor/verify-totp', request: settingUp, sessionCookie: 'tok', sessionFound: true }),
    );
    expect(classifyNewSession('/two-factor/verify-totp', settingUp)).toBe('not-a-sign-in');
  });

  it('a backup code finishing a sign-in counts too', async () => {
    const r = new Request('https://x.test/api/auth/two-factor/verify-backup-code', { method: 'POST' });
    await noteTwoFactorVerifier(ctx({ path: '/two-factor/verify-backup-code', request: r, sessionCookie: 'stale' }));
    expect(classifyNewSession('/two-factor/verify-backup-code', r)).toBe('sign-in');
  });

  it('leaves every other sign-in as it was', () => {
    for (const path of ['/callback/:id', '/passkey/verify-authentication', '/email-otp/verify-email', undefined]) {
      expect(classifyNewSession(path, new Request('https://x.test'))).toBe('sign-in');
    }
  });
});

describe('completedPasswordSignIn', () => {
  it('is the new session when the account has no 2FA', async () => {
    const c = ctx({ path: '/sign-in/email', newSession: { session, user: { twoFactorEnabled: false } } });
    await expect(completedPasswordSignIn(c)).resolves.toEqual(session);
  });

  it('is null while the code step is pending', async () => {
    const c = ctx({
      path: '/sign-in/email',
      newSession: { session, user: { twoFactorEnabled: true } },
      requiresTwoFactor: true,
    });
    await expect(completedPasswordSignIn(c)).resolves.toBeNull();
  });

  it('is the session on a trusted device (no code asked)', async () => {
    const c = ctx({
      path: '/sign-in/email',
      newSession: { session, user: { twoFactorEnabled: true } },
      requiresTwoFactor: false,
    });
    await expect(completedPasswordSignIn(c)).resolves.toEqual(session);
  });

  it('fails closed when the plugin cannot answer', async () => {
    const c = ctx({
      path: '/sign-in/email',
      newSession: { session, user: { twoFactorEnabled: true } },
      requiresTwoFactor: null,
    });
    await expect(completedPasswordSignIn(c)).resolves.toBeNull();
  });

  it('is null for a failed sign-in or another path', async () => {
    await expect(completedPasswordSignIn(ctx({ path: '/sign-in/email', newSession: null }))).resolves.toBeNull();
    await expect(
      completedPasswordSignIn(ctx({ path: '/sign-up/email', newSession: { session, user: {} } })),
    ).resolves.toBeNull();
  });
});

describe('TWO_FACTOR_OPTIONS', () => {
  it('stores backup codes encrypted, locks after 10 wrong codes, trusts a device for 30 days', () => {
    expect(TWO_FACTOR_OPTIONS.backupCodeOptions.storeBackupCodes).toBe('encrypted');
    expect(TWO_FACTOR_OPTIONS.accountLockout).toEqual({ enabled: true, maxFailedAttempts: 10, durationSeconds: 900 });
    expect(TWO_FACTOR_OPTIONS.trustDeviceMaxAge).toBe(30 * 24 * 60 * 60);
  });
});
