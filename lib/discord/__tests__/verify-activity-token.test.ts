/** The Activity token check is a security boundary: foreign-app, expired or unconfigured fails closed. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bearerToken,
  clearActivityTokenCache,
  verifyDiscordActivityToken,
} from '@/lib/discord/verify-activity-token.server';

const info = (over: Record<string, unknown> = {}) => ({
  application: { id: 'app-1' },
  expires: new Date(Date.now() + 3600_000).toISOString(),
  user: { id: '555' },
  ...over,
});
const fetchMock = vi.fn();

beforeEach(() => {
  clearActivityTokenCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('DISCORD_ACTIVITY_CLIENT_ID', 'app-1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe('verifyDiscordActivityToken', () => {
  it('accepts a token issued for our application and caches the verdict', async () => {
    fetchMock.mockResolvedValue(ok(info()));
    expect((await verifyDiscordActivityToken('t'))?.discordId).toBe('555');
    await verifyDiscordActivityToken('t');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a token minted for another application', async () => {
    fetchMock.mockResolvedValue(ok(info({ application: { id: 'other' } })));
    expect(await verifyDiscordActivityToken('t')).toBeNull();
  });

  it('rejects an expired token and a failed lookup', async () => {
    fetchMock.mockResolvedValueOnce(ok(info({ expires: new Date(Date.now() - 1000).toISOString() })));
    expect(await verifyDiscordActivityToken('a')).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await verifyDiscordActivityToken('b')).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await verifyDiscordActivityToken('c')).toBeNull();
  });

  it('fails closed with no application id configured', async () => {
    vi.stubEnv('DISCORD_ACTIVITY_CLIENT_ID', '');
    expect(await verifyDiscordActivityToken('t')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('bearerToken', () => {
  it('reads a Bearer header only', () => {
    expect(bearerToken(new Headers({ authorization: 'Bearer abc' }))).toBe('abc');
    expect(bearerToken(new Headers({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
