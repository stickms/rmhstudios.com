/**
 * The run receipt: a signed statement of when a run started.
 *
 * The reason it is signed rather than remembered is in the module doc — the web
 * tier is stateless and blue/green, so a token minted by one container has to be
 * verifiable by another with no shared memory. The tests below are therefore
 * mostly about what a token refuses to be: forged, borrowed for a different run,
 * or replayed for a different account.
 */

import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-run-tokens';
});

const load = () => import('../run-token.server');

describe('run tokens', () => {
  it('round-trips and reports how long ago it was issued', async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const issuedAt = 1_700_000_000_000;
    const token = issueRunToken('user-1', 'song-1', issuedAt);

    const result = verifyRunToken(token, 'user-1', 'song-1', issuedAt + 90_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issuedAt).toBe(issuedAt);
    expect(result.elapsedMs).toBe(90_000);
  });

  it('refuses a token minted for a different user', async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const token = issueRunToken('user-1', 'song-1', 1_700_000_000_000);
    const result = verifyRunToken(token, 'user-2', 'song-1', 1_700_000_100_000);
    expect(result).toEqual({ ok: false, reason: 'wrong_run' });
  });

  it('refuses a token minted for a different song', async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const token = issueRunToken('user-1', 'song-1', 1_700_000_000_000);
    const result = verifyRunToken(token, 'user-1', 'song-2', 1_700_000_100_000);
    expect(result).toEqual({ ok: false, reason: 'wrong_run' });
  });

  it('refuses a token whose timestamp was edited', async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const issuedAt = 1_700_000_000_000;
    const token = issueRunToken('user-1', 'song-1', issuedAt);

    // The attack the signature exists for: backdate the issue time so a run
    // that took two seconds appears to have taken four minutes.
    const parts = token.split('.');
    parts[3] = String(issuedAt - 240_000);
    const forged = parts.join('.');

    expect(verifyRunToken(forged, 'user-1', 'song-1', issuedAt).ok).toBe(false);
    expect(verifyRunToken(forged, 'user-1', 'song-1', issuedAt)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('refuses garbage without throwing', async () => {
    const { verifyRunToken } = await load();
    const now = Date.now();
    expect(verifyRunToken(null, 'u', 's', now).ok).toBe(false);
    expect(verifyRunToken('', 'u', 's', now)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyRunToken('nonsense', 'u', 's', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyRunToken('v1.u.s.notanumber.sig', 'u', 's', now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyRunToken('v9.u.s.1.sig', 'u', 's', now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('expires, so a token is not a permanent licence to submit', async () => {
    const { issueRunToken, verifyRunToken, MAX_TOKEN_AGE_MS } = await load();
    const issuedAt = 1_700_000_000_000;
    const token = issueRunToken('user-1', 'song-1', issuedAt);

    expect(verifyRunToken(token, 'user-1', 'song-1', issuedAt + MAX_TOKEN_AGE_MS - 1).ok).toBe(
      true,
    );
    expect(verifyRunToken(token, 'user-1', 'song-1', issuedAt + MAX_TOKEN_AGE_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('treats a token from the future as zero elapsed, not as a head start', async () => {
    const { issueRunToken, verifyRunToken } = await load();
    const issuedAt = 1_700_000_000_000;
    const token = issueRunToken('user-1', 'song-1', issuedAt);
    // Clock skew between containers must not produce a negative elapsed time
    // that then sails through the "did enough time pass" check.
    const result = verifyRunToken(token, 'user-1', 'song-1', issuedAt - 5_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.elapsedMs).toBe(0);
  });
});
