/**
 * Auth, end to end: Better Auth's email/password flow and the session gate in
 * front of every write. Nothing else in the suite works if these do not.
 */
import { afterAll, describe, expect, inject, it } from 'vitest';
import { Client, PASSWORD, closeDb, db, eventually, signUp } from './lib/client';

afterAll(closeDb);

describe('auth', () => {
  it('signs up with email + password, issues a session, and assigns a handle', async () => {
    const user = await signUp('auth');
    const session = await user.client.get('/api/auth/get-session');
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe(user.id);
    expect(session.body.user.email).toBe(user.email);
    expect(session.body.user.tier).toBe('free');

    // The handle is assigned in a create hook just after the row is written.
    const handle = await eventually(async () => {
      const { rows } = await db().query('select handle from "user" where id = $1', [user.id]);
      return rows[0]?.handle as string | null;
    });
    expect(handle).toMatch(/^[a-z0-9_]+$/);
  });

  it('signs out: the session is revoked and the signing-out browser is signed out', async () => {
    const user = await signUp('signout');
    // A second, independent session for the same account.
    const other = new Client();
    const signIn = await other.post('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const token = signIn.body.token as string;

    const out = await other.post('/api/auth/sign-out', {});
    expect(out.status).toBe(200);
    expect(other.hasSession).toBe(false);
    const { rows } = await db().query('select count(*)::int as n from session where token = $1', [token]);
    expect(rows[0].n).toBe(0);
    const after = await other.post('/api/rmharks', { content: 'should not post' });
    expect(after.status).toBe(401);

    // Signing one session out leaves the account's other session alone.
    const first = await user.client.get('/api/auth/get-session');
    expect(first.body.user.id).toBe(user.id);
  });

  /**
   * Regression test for the revocation hole this suite found on 2026-10-21:
   * with `session.cookieCache` (lib/auth.ts, maxAge 300), a copy of a session's
   * cookies taken before sign-out — a stolen cookie — kept WRITING for up to 5
   * minutes after the session row was deleted. Writes now always read the
   * session row (the getSession wrapper at the bottom of lib/auth.ts).
   */
  it('a revoked session cookie cannot write', async () => {
    const user = await signUp('revoke');
    const stolen = new Client(user.client.cookies);
    expect((await user.client.post('/api/auth/sign-out', {})).status).toBe(200);

    // Both kinds of write route: one behind `defineHandler`, and one of the
    // routes that calls auth.api.getSession itself (and moves coins).
    const write = await stolen.post('/api/rmharks', { content: 'posted with a revoked session' });
    expect(write.status).toBe(401);
    const tip = await stolen.post('/api/coins/tip', { recipientId: inject('bob').id, amount: 1 });
    expect(tip.status).toBe(401);
  });

  it('rejects a wrong password without setting a session', async () => {
    const alice = inject('alice');
    const attacker = new Client();
    const res = await attacker.post('/api/auth/sign-in/email', { email: alice.email, password: 'not-the-password-1' });
    expect(res.status).toBe(401);
    expect(attacker.hasSession).toBe(false);
  });

  it('refuses writes with no session', async () => {
    const anon = new Client();
    const res = await anon.post('/api/rmharks', { content: 'anonymous post' });
    expect(res.status).toBe(401);
  });
});
