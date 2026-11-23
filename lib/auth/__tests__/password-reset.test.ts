/**
 * The forgotten-password policy (`lib/auth/password-reset.server.ts`): reset tokens are hashed at rest,
 * only the newest link works, one account receives at most `RESET_EMAILS_PER_HOUR` reset emails an hour
 * whatever the number of IPs asking, and a link goes only to an account it proves something for. Every
 * refusal deletes the token Better Auth already stored, so it can never be used.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
  findFirst: vi.fn(async (_args: unknown): Promise<{ id: string } | null> => null),
  sendEmail: vi.fn(async (_input: unknown) => true),
  recordSecurityEvent: vi.fn(async (_input: unknown) => undefined),
  redisRateLimit: vi.fn(async (..._a: unknown[]): Promise<{ allowed: boolean } | null> => null),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    verification: { deleteMany: h.deleteMany },
    account: { findFirst: h.findFirst },
  },
}));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: h.sendEmail }));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: h.recordSecurityEvent }));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: h.redisRateLimit }));

import {
  RESET_EMAILS_PER_HOUR,
  hashResetIdentifier,
  onResetRequested,
  revokeResetLinks,
} from '@/lib/auth/password-reset.server';

const request = new Request('https://rmhstudios.com/api/auth/request-password-reset', { method: 'POST' });
const URL_ = 'https://rmhstudios.com/api/auth/reset-password/TOKEN123?callbackURL=%2Freset-password';
let n = 0;
/** A fresh account per test, so the in-process allowance never carries over. */
const freshUser = (over: Partial<{ email: string; emailVerified: boolean }> = {}) => ({
  id: `user-${++n}`,
  email: 'member@example.com',
  emailVerified: true,
  ...over,
});
const storedFor = (token: string) =>
  'reset-password:' + createHash('sha256').update(`reset-password:${token}`).digest('base64url');

/** Refusals so far: deletes of one exact token (the send path only deletes by prefix). */
const refusals = () =>
  h.deleteMany.mock.calls.filter(([args]) => typeof (args as { where: { identifier: unknown } }).where.identifier === 'string')
    .length;

/** Run one request and wait for its background work to end in a send or a refusal. */
async function request_(user: ReturnType<typeof freshUser>, token = 'TOKEN123') {
  const before = h.sendEmail.mock.calls.length + refusals();
  onResetRequested({ user, url: URL_, token }, request);
  await vi.waitFor(() => expect(h.sendEmail.mock.calls.length + refusals()).toBe(before + 1));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue(null);
  h.redisRateLimit.mockResolvedValue(null);
});

describe('hashResetIdentifier', () => {
  it('keeps the prefix, is deterministic and does not contain the token', async () => {
    const a = await hashResetIdentifier('reset-password:TOKEN123');
    expect(a).toBe(storedFor('TOKEN123'));
    expect(a).toBe(await hashResetIdentifier('reset-password:TOKEN123'));
    expect(a.startsWith('reset-password:')).toBe(true);
    expect(a).not.toContain('TOKEN123');
    expect(await hashResetIdentifier('reset-password:OTHER')).not.toBe(a);
  });
});

describe('onResetRequested', () => {
  it('returns before any of its work is done', () => {
    h.findFirst.mockImplementation(() => new Promise(() => {}));
    const result = onResetRequested({ user: freshUser({ emailVerified: false }), url: URL_, token: 'T' }, request);
    expect(result).toBeUndefined();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it('sends the link through sendEmail, revokes earlier links and logs without the token', async () => {
    const user = freshUser();
    await request_(user);
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: { value: user.id, identifier: { startsWith: 'reset-password:', not: storedFor('TOKEN123') } },
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const mail = h.sendEmail.mock.calls[0]![0] as { to: string; subject: string; html: string; text: string };
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toBe('Reset your RMH Studios password');
    expect(mail.text).toContain(URL_);
    expect(mail.html).toContain(URL_.replace(/&/g, '&#38;'));
    expect(mail.html).toContain('expires in one hour');
    expect(h.recordSecurityEvent).toHaveBeenCalledWith({ userId: user.id, kind: 'password_reset_requested', request });
    expect(JSON.stringify(h.recordSecurityEvent.mock.calls)).not.toContain('TOKEN123');
  });

  it('sends to an unconfirmed address when the account has a password (pre-registered account recovery)', async () => {
    h.findFirst.mockResolvedValue({ id: 'acct-1' });
    await request_(freshUser({ emailVerified: false }));
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('refuses an account with no password and an unconfirmed address, and deletes the token', async () => {
    await request_(freshUser({ emailVerified: false }), 'NOPE');
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.recordSecurityEvent).not.toHaveBeenCalled();
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { identifier: storedFor('NOPE') } });
  });

  it('refuses a placeholder address', async () => {
    await request_(freshUser({ email: '76561198000000000@steam.placeholder.invalid' }), 'PH');
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { identifier: storedFor('PH') } });
  });

  it(`sends at most ${RESET_EMAILS_PER_HOUR} emails an hour to one account, then deletes each new token`, async () => {
    const user = freshUser();
    for (let i = 0; i < RESET_EMAILS_PER_HOUR; i++) await request_(user, `OK${i}`);
    expect(h.sendEmail).toHaveBeenCalledTimes(RESET_EMAILS_PER_HOUR);
    await request_(user, 'OVER');
    expect(h.sendEmail).toHaveBeenCalledTimes(RESET_EMAILS_PER_HOUR);
    expect(h.deleteMany).toHaveBeenLastCalledWith({ where: { identifier: storedFor('OVER') } });
    // Another account is unaffected.
    await request_(freshUser());
    expect(h.sendEmail).toHaveBeenCalledTimes(RESET_EMAILS_PER_HOUR + 1);
  });

  it('uses the shared Redis allowance when Redis answers', async () => {
    h.redisRateLimit.mockResolvedValue({ allowed: false });
    const user = freshUser();
    await request_(user, 'R');
    expect(h.redisRateLimit).toHaveBeenCalledWith(`pw-reset:${user.id}`, RESET_EMAILS_PER_HOUR, 60 * 60 * 1000);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});

describe('revokeResetLinks', () => {
  it('deletes every reset link of the account and nothing else', async () => {
    h.deleteMany.mockResolvedValueOnce({ count: 2 });
    expect(await revokeResetLinks('user-x')).toBe(2);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { value: 'user-x', identifier: { startsWith: 'reset-password:' } } });
  });

  it('never throws', async () => {
    h.deleteMany.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    expect(await revokeResetLinks('user-x')).toBe(0);
  });
});
