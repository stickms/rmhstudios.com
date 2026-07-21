import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable DNS + undici mocks so we can drive redirect chains and rebinding
// scenarios without real network. `safeFetch` resolves hostnames via
// node:dns/promises#lookup and issues requests via undici's fetch; we replace
// both. The Agent is a no-op whose only contract here is a `destroy()` method.
// vi.hoisted so the mock fns exist before the hoisted vi.mock factories run.
const { lookupMock, fetchMock } = vi.hoisted(() => ({
  lookupMock: vi.fn<(host: string, opts: unknown) => Promise<{ address: string; family: number }[]>>(),
  fetchMock: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  lookup: (host: string, opts: unknown) => lookupMock(host, opts),
}));
vi.mock('undici', () => ({
  Agent: class FakeAgent {
    destroy() {
      return Promise.resolve();
    }
  },
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

import { safeFetch, isPrivateIp, SsrfError } from '@/lib/ssrf-guard.server';

/** Minimal stand-in for the undici Response shape safeFetch consumes. */
function res(init: { status: number; location?: string; body?: ReadableStream<Uint8Array> | null }) {
  const headers = new Headers();
  if (init.location) headers.set('location', init.location);
  return { status: init.status, statusText: '', headers, body: init.body ?? null };
}

beforeEach(() => {
  lookupMock.mockReset();
  fetchMock.mockReset();
});

describe('isPrivateIp', () => {
  it('flags loopback, private, link-local and metadata IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1', // multicast
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public IPv4', () => {
    for (const ip of ['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it('returns false for non-IP strings (hostnames are validated via DNS instead)', () => {
    // isPrivateIp only judges literal IPs; a string isIP() rejects is a
    // hostname, which safeFetch resolves + re-checks per record downstream.
    for (const s of ['999.1.1.1', 'example.com', 'not-an-ip', '']) {
      expect(isPrivateIp(s), s).toBe(false);
    }
  });

  it('flags IPv6 loopback, ULA, link-local and mapped-private', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'feba::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6 and public IPv4-mapped', () => {
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIp('::ffff:93.184.216.34')).toBe(false);
  });
});

describe('safeFetch — direct targets', () => {
  it('rejects an IP-literal metadata address before any fetch', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/', { allowedProtocols: ['http:'] })).rejects.toBeInstanceOf(
      SsrfError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a disallowed protocol', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfError);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address (rebinding via DNS)', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    await expect(safeFetch('https://sneaky.example/')).rejects.toBeInstanceOf(SsrfError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when ANY resolved record is private (mixed A records)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(safeFetch('https://mixed.example/')).rejects.toBeInstanceOf(SsrfError);
  });
});

describe('safeFetch — redirect re-validation', () => {
  it('re-validates a single redirect and blocks an internal Location', async () => {
    lookupMock.mockImplementation(async (host: string) => {
      if (host === 'ok.example') return [{ address: '93.184.216.34', family: 4 }];
      return [{ address: '169.254.169.254', family: 4 }]; // evil.internal → metadata
    });
    fetchMock.mockResolvedValueOnce(res({ status: 302, location: 'http://evil.internal/x' }));

    await expect(safeFetch('http://ok.example/', { allowedProtocols: ['http:'] })).rejects.toBeInstanceOf(SsrfError);
    // The first (public) hop WAS fetched; the internal redirect target was
    // caught by re-validating the Location before following it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks an internal target at the end of a redirect chain', async () => {
    lookupMock.mockImplementation(async (host: string) => {
      if (host.endsWith('.internal')) return [{ address: '10.0.0.9', family: 4 }];
      return [{ address: '93.184.216.34', family: 4 }];
    });
    fetchMock
      .mockResolvedValueOnce(res({ status: 302, location: 'https://b.public.example/' }))
      .mockResolvedValueOnce(res({ status: 302, location: 'https://c.internal/' }));

    await expect(safeFetch('https://a.public.example/')).rejects.toBeInstanceOf(SsrfError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps the number of redirects followed', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(res({ status: 302, location: 'https://loop.example/next' }));

    await expect(safeFetch('https://loop.example/', { maxRedirects: 2 })).rejects.toThrow(/too many redirects/i);
  });

  it('returns the response on a normal 200', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(res({ status: 200 }));

    const out = await safeFetch('https://ok.example/');
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
