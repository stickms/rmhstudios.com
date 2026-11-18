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

describe('verifyDiscordActivityToken abuse protection', () => {
  it('remembers a refused token for 60 s and never asks Discord again', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    expect(await verifyDiscordActivityToken('bad', '10.0.0.1')).toBeNull();
    expect(await verifyDiscordActivityToken('bad', '10.0.0.1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('remembers a token minted for another application', async () => {
    fetchMock.mockResolvedValue(ok(info({ application: { id: 'other' } })));
    await verifyDiscordActivityToken('foreign', '10.0.0.2');
    await verifyDiscordActivityToken('foreign', '10.0.0.2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not remember 5xx, 429 or network failures', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    fetchMock.mockResolvedValueOnce(ok(info()));
    for (let i = 0; i < 3; i++) expect(await verifyDiscordActivityToken('flaky', '10.0.0.3')).toBeNull();
    expect((await verifyDiscordActivityToken('flaky', '10.0.0.3'))?.discordId).toBe('555');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('shares one outbound call between concurrent verifications of a token', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const calls = [1, 2, 3].map(() => verifyDiscordActivityToken('same', '10.0.0.4'));
    release(ok(info()));
    const results = await Promise.all(calls);
    expect(results.every((r) => r?.discordId === '555')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('limits unseen-token verifications per IP before calling Discord', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 40; i++) await verifyDiscordActivityToken(`spray-${i}`, '10.0.0.5');
    expect(fetchMock).toHaveBeenCalledTimes(30);
    expect(warn).toHaveBeenCalledTimes(1);
    // A different IP is unaffected, and cache hits cost nothing.
    await verifyDiscordActivityToken('spray-0', '10.0.0.5');
    await verifyDiscordActivityToken('fresh', '10.0.0.6');
    expect(fetchMock).toHaveBeenCalledTimes(31);
    warn.mockRestore();
  });
});

describe('bearerToken', () => {
  it('reads a Bearer header only', () => {
    expect(bearerToken(new Headers({ authorization: 'Bearer abc' }))).toBe('abc');
    expect(bearerToken(new Headers({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
