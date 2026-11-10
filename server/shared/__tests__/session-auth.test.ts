import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUTH_CACHE_TTL_MS,
  createAuthCache,
  createSessionAuth,
  extractSessionToken,
} from '../session-auth';

const FUTURE = () => new Date(Date.now() + 3_600_000);

function makeAuth(rows: unknown[], defaultName = 'Player') {
  const query = vi.fn().mockResolvedValue({ rows });
  const end = vi.fn().mockResolvedValue(undefined);
  const auth = createSessionAuth({
    service: 'test',
    defaultName,
    pool: { query, end } as never,
  });
  return { auth, query, end };
}

describe('extractSessionToken', () => {
  it('reads handshake.auth.token', () => {
    expect(extractSessionToken({ auth: { token: 'abc' } })).toBe('abc');
  });
  it('returns null for missing, empty and non-string values', () => {
    expect(extractSessionToken(undefined)).toBeNull();
    expect(extractSessionToken({})).toBeNull();
    expect(extractSessionToken({ auth: null })).toBeNull();
    expect(extractSessionToken({ auth: { token: '' } })).toBeNull();
    expect(extractSessionToken({ auth: { token: 42 } })).toBeNull();
  });
  it('passes the token through untouched (no cookie signature stripping, as every hub did)', () => {
    expect(extractSessionToken({ auth: { token: 'tok.sig%2Bx' } })).toBe('tok.sig%2Bx');
  });
  it('ignores cookie / bearer / query forms no hub accepted', () => {
    expect(
      extractSessionToken({
        headers: { cookie: 'better-auth.session_token=a.b', authorization: 'Bearer z' },
        query: { token: 'q' },
      } as never),
    ).toBeNull();
  });
});

describe('resolveSocketSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('no_token without touching the db', async () => {
    const { auth, query } = makeAuth([]);
    expect(await auth.resolveSocketSession({ auth: {} })).toEqual({ status: 'no_token' });
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves a valid session and caches it', async () => {
    const exp = FUTURE();
    const { auth, query } = makeAuth([{ userId: 'u1', expiresAt: exp, name: 'Ann', image: 'i.png' }]);
    const hs = { auth: { token: 't1' } };
    const first = await auth.resolveSocketSession(hs);
    expect(first).toMatchObject({
      status: 'ok',
      session: { userId: 'u1', name: 'Ann', image: 'i.png', token: 't1', expiresAt: exp.getTime() },
    });
    expect(query.mock.calls[0][1]).toEqual(['t1']);
    expect(await auth.resolveSocketSession(hs)).toEqual(first);
    expect(query).toHaveBeenCalledTimes(1); // cache hit
  });

  it('applies the per-hub fallback name and null image', async () => {
    const { auth } = makeAuth([{ userId: 'u', expiresAt: FUTURE(), name: '', image: '' }], 'Viewer');
    const r = await auth.resolveSocketSession({ auth: { token: 't' } });
    expect(r).toMatchObject({ status: 'ok', session: { name: 'Viewer', image: null } });
  });

  it('not_found when no row', async () => {
    const { auth } = makeAuth([]);
    expect(await auth.resolveSocketSession({ auth: { token: 'x' } })).toEqual({ status: 'not_found' });
  });

  it('expired when the row is past expiry, and is not cached', async () => {
    const { auth, query } = makeAuth([
      { userId: 'u', expiresAt: new Date(Date.now() - 1000), name: 'n', image: null },
    ]);
    const hs = { auth: { token: 'old' } };
    expect(await auth.resolveSocketSession(hs)).toEqual({ status: 'expired' });
    await auth.resolveSocketSession(hs);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('re-queries after the cache TTL', async () => {
    const { auth, query } = makeAuth([{ userId: 'u', expiresAt: FUTURE(), name: 'n', image: null }]);
    const hs = { auth: { token: 't' } };
    await auth.resolveSocketSession(hs);
    vi.advanceTimersByTime(AUTH_CACHE_TTL_MS + 1);
    await auth.resolveSocketSession(hs);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not serve a cached session past the session row expiry', async () => {
    const { auth, query } = makeAuth([
      { userId: 'u', expiresAt: new Date(Date.now() + 5_000), name: 'n', image: null },
    ]);
    const hs = { auth: { token: 't' } };
    await auth.resolveSocketSession(hs);
    vi.advanceTimersByTime(6_000);
    await auth.resolveSocketSession(hs);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('unavailable without a database', async () => {
    const auth = createSessionAuth({ service: 't', defaultName: 'P' });
    expect(await auth.resolveSocketSession({ auth: { token: 't' } })).toEqual({
      status: 'unavailable',
    });
  });

  it('propagates db errors so each hub can apply its own policy', async () => {
    const query = vi.fn().mockRejectedValue(new Error('db down'));
    const auth = createSessionAuth({ service: 't', defaultName: 'P', pool: { query, end: vi.fn() } as never });
    await expect(auth.resolveSocketSession({ auth: { token: 't' } })).rejects.toThrow('db down');
  });

  it('close ends the pool', async () => {
    const { auth, end } = makeAuth([]);
    await auth.close();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

describe('createAuthCache', () => {
  it('is bounded: evicts the oldest entry at capacity', () => {
    const cache = createAuthCache<number>();
    for (let i = 0; i < 10_001; i++) cache.set(`k${i}`, i, Number.POSITIVE_INFINITY);
    expect(cache.size).toBe(10_000);
    expect(cache.get('k0')).toBeNull();
    expect(cache.get('k10000')).toBe(10_000);
  });
});
